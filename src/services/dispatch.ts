import crypto from "node:crypto";
import {drivers,orders,changed,transaction} from "../store.js";
import {rankCandidates} from "./queue.js";
import {beginServiceLocation,endDriverLocation} from "./location.js";
import {emitDomainEvent} from "../events.js";
import {driverView,orderView} from "../projections/operations.js";
import {sendTwinMessage} from "./twins.js";
import type {Order,OrderStatus} from "../domain.js";

const OFFER_TTL=Number(process.env.DISPATCH_OFFER_TTL_SECONDS??60);

const transitionEvents:Record<string,string>={
 "ASSIGNED>PICKED_UP":"PickupConfirmed",
 "PICKED_UP>IN_TRANSIT":"TransitStarted",
 "IN_TRANSIT>ARRIVED":"DriverArrived"
};

function requireOrder(id:string){
 const o=orders.get(id);
 if(!o)throw Error("Pedido não encontrado");
 return o;
}

export function createDispatchOffer(orderId:string){
 let result:Order|undefined;
 transaction(()=>{
  const o=requireOrder(orderId);
  if(o.status!=="SEARCHING_DRIVER")return;
  const candidates=rankCandidates(o.pickup);
  for(const candidate of candidates)emitDomainEvent({type:"CandidateEvaluated",aggregateType:"order",aggregateId:o.id,payload:{serviceId:o.id,driverId:candidate.driver.id,deliveriesPerHour:candidate.deliveriesPerHour,distanceKm:candidate.distanceKm,etaMinutes:candidate.etaMinutes,eligible:true}});
  const excluded=new Set(o.dispatchExcludedDriverIds??[]);
  const candidate=candidates.find(x=>!excluded.has(x.driver.id))??(candidates.length&&!excluded.size?candidates[0]:undefined);
  if(!candidate){emitDomainEvent({type:"CandidateEvaluated",aggregateType:"order",aggregateId:o.id,payload:{serviceId:o.id,candidates:0,eligible:false},projections:[orderView(o)]});result=o;return}
  const now=new Date();
  const offerId=crypto.randomUUID();
  o.status="OFFERED";
  o.dispatchOfferId=offerId;
  o.offeredAt=now.toISOString();
  o.offerExpiresAt=new Date(now.getTime()+OFFER_TTL*1000).toISOString();
  o.assignedDriverId=candidate.driver.id;
  o.assignedProviderId=candidate.providerId;
  candidate.driver.status="BUSY";
  emitDomainEvent({
   type:"DispatchOffered",
   aggregateType:"order",
   aggregateId:o.id,
   payload:{serviceId:o.id,driverId:candidate.driver.id,providerId:candidate.providerId,offerId,offerExpiresAt:o.offerExpiresAt,etaMinutes:candidate.etaMinutes,distanceKm:candidate.distanceKm},
   projections:[orderView(o),driverView(candidate.driver)]
  });
  beginServiceLocation(candidate.driver.id,o.id);
  result=o;
 });
 if(result?.status==="OFFERED"){
  const timer=setTimeout(()=>expireDispatchOffers(),OFFER_TTL*1000);
  (timer as NodeJS.Timeout).unref?.();
  const d=result.assignedDriverId?drivers.get(result.assignedDriverId):undefined;
  if(d)sendTwinMessage(result.id,"DRIVER",`Nova entrega ${result.id.slice(0,8)}. Responda ACEITAR ou RECUSAR.`).catch(()=>{});
 }
 changed();
 return result;
}

export function acceptDispatch(orderId:string,driverId:string){
 let accepted=false;
 let result:Order|undefined;
 transaction(()=>{
  const o=requireOrder(orderId);
  if(o.status!=="OFFERED"||o.assignedDriverId!==driverId)throw Error("Oferta não disponível para este motorista");
  if(o.offerExpiresAt&&Date.parse(o.offerExpiresAt)<=Date.now())throw Error("Oferta expirada");
  o.status="ASSIGNED";
  o.assignedProviderId=o.assignedProviderId??(d.providerId??d.companyId);
  o.acceptedAt=new Date().toISOString();
  o.assignedAt=o.acceptedAt;
  delete o.offerExpiresAt;
  delete o.dispatchOfferId;
  const d=drivers.get(driverId);
  if(!d)throw Error("Motoboy não encontrado");
  d.status="BUSY";
  emitDomainEvent({type:"DispatchAccepted",aggregateType:"order",aggregateId:o.id,payload:{serviceId:o.id,driverId,providerId:o.assignedProviderId,acceptedAt:o.acceptedAt},projections:[orderView(o),driverView(d)]});
  beginServiceLocation(driverId,o.id);
  result=o;accepted=true;
 });
 if(accepted)changed();
 return result!;
}

function releaseOffer(o:Order,reason:"rejected"|"timeout"){
 const driverId=o.assignedDriverId;
 if(driverId&&reason==="rejected"){o.dispatchExcludedDriverIds=[...(o.dispatchExcludedDriverIds??[]),driverId]}
 if(driverId){
  const d=drivers.get(driverId);
  if(d){d.status="AVAILABLE";delete d.lastAssignedAt}
 }
 delete o.assignedDriverId;
 delete o.dispatchOfferId;
 delete o.offerExpiresAt;
 delete o.offeredAt;
 o.status="SEARCHING_DRIVER";
 emitDomainEvent({
  type:reason==="rejected"?"DispatchRejected":"DispatchTimedOut",
  aggregateType:"order",
  aggregateId:o.id,
  payload:{serviceId:o.id,driverId,reason},
  projections:[orderView(o),...(driverId&&drivers.get(driverId)?[driverView(drivers.get(driverId)!)]:[])]
 });
}

export function rejectDispatch(orderId:string,driverId:string){
 let shouldRequeue=false;
 let result:Order|undefined;
 transaction(()=>{
  const o=requireOrder(orderId);
  if(o.status!=="OFFERED"||o.assignedDriverId!==driverId)throw Error("Oferta não disponível para este motorista");
  const previousDriverId=o.assignedDriverId;
  releaseOffer(o,"rejected");
  result=o;
  shouldRequeue=true;
 });
 if(shouldRequeue){endDriverLocation(driverId,orderId);createDispatchOffer(orderId)}
 else changed();
 return result!;
}

export function expireDispatchOffers(){
 const expired:Array<{orderId:string;driverId?:string}>=[];
 transaction(()=>{
  const now=Date.now();
  for(const o of orders.values()){
   if(o.status==="OFFERED"&&o.offerExpiresAt&&Date.parse(o.offerExpiresAt)<=now){
    const previousDriverId=o.assignedDriverId;
    releaseOffer(o,"timeout");
    expired.push({orderId:o.id,driverId:previousDriverId});
   }
  }
 });
 for(const item of expired){if(item.driverId)endDriverLocation(item.driverId,item.orderId);createDispatchOffer(item.orderId)}
 if(expired.length)changed();
 return expired.map(x=>x.orderId);
}

export function dispatchSearch(orderId:string){
 expireDispatchOffers();
 return createDispatchOffer(orderId);
}

const validTransitions:Record<OrderStatus,OrderStatus[]>={
 AWAITING_PAYMENT:[],
 PAID:["SEARCHING_DRIVER"],
 SEARCHING_DRIVER:["OFFERED"],
 OFFERED:["ASSIGNED","SEARCHING_DRIVER"],
 ASSIGNED:["PICKED_UP"],
 PICKED_UP:["IN_TRANSIT"],
 IN_TRANSIT:["ARRIVED"],
 ARRIVED:["AWAITING_CONFIRMATION"],
 AWAITING_CONFIRMATION:["COMPLETED"],
 COMPLETED:[],
 CANCELLED:[],
};

export function requestDeliveryConfirmation(orderId:string){
 let result:Order|undefined;
 transaction(()=>{
  const o=requireOrder(orderId);
  if(o.status!=="ARRIVED")throw Error("A entrega só pode ser confirmada após a chegada");
  o.status="AWAITING_CONFIRMATION";
  o.confirmationCode=String(Math.floor(1e5+Math.random()*9e5));
  emitDomainEvent({type:"ConfirmationRequested",aggregateType:"order",aggregateId:o.id,payload:{serviceId:o.id,driverId:o.assignedDriverId},projections:[orderView(o)]});
  result=o;
 });
 changed();
 return result!;
}

export function transitionDelivery(orderId:string,next:OrderStatus,actorDriverId?:string){
 let result:Order|undefined;
 transaction(()=>{
  const o=requireOrder(orderId);
  if(!validTransitions[o.status].includes(next))throw Error(`Transição inválida: ${o.status} → ${next}`);
  if(actorDriverId&&o.assignedDriverId!==actorDriverId)throw Error("Motorista não está atribuído a este pedido");
  const previous=o.status;
  const now=new Date().toISOString();
  if(next==="PICKED_UP")o.pickedUpAt=now;
  if(next==="IN_TRANSIT")o.inTransitAt=now;
  if(next==="ARRIVED")o.arrivedAt=now;
  o.status=next;
  const d=o.assignedDriverId?drivers.get(o.assignedDriverId):undefined;
  const eventType=transitionEvents[`${previous}>${next}`]??(next==="AWAITING_CONFIRMATION"?"ConfirmationRequested":undefined);
  if(eventType)emitDomainEvent({type:eventType as any,aggregateType:"order",aggregateId:o.id,payload:{serviceId:o.id,driverId:o.assignedDriverId,from:previous,to:next,at:now},projections:[orderView(o),...(d?[driverView(d)]:[])]});
  result=o;
 });
 changed();
 return result!;
}

export function cancelOrReleaseDelivery(orderId:string){
 let result:Order|undefined;
 transaction(()=>{
  const o=requireOrder(orderId);
  if(["COMPLETED","CANCELLED"].includes(o.status))return;
  const driverId=o.assignedDriverId;
  if(driverId){
   const d=drivers.get(driverId);
   if(d){d.status="AVAILABLE";delete d.lastAssignedAt}
  }
  o.status="CANCELLED";
  delete o.dispatchOfferId;delete o.offerExpiresAt;delete o.assignedDriverId;
  emitDomainEvent({type:"DeliveryCancelled",aggregateType:"order",aggregateId:o.id,payload:{serviceId:o.id,driverId},projections:[orderView(o),...(driverId&&drivers.get(driverId)?[driverView(drivers.get(driverId)!)]:[])]});
  result=o;
 });
 if(result?.assignedDriverId)endDriverLocation(result.assignedDriverId,result.id);
 changed();
 return result;
}
