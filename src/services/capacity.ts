import crypto from "node:crypto";
import type {CapacityReservation,Driver} from "../domain.js";
import {capacityReservations,companies,drivers,orders,shifts,changed,transaction} from "../store.js";
import {refreshLocationSessions} from "./location.js";import {rankCandidates} from "./queue.js";
import {effectiveActiveSeconds} from "./work-time.js";
import {isDispatchEligibleByPolicy} from "./work-policy.js";
import {emitDomainEvent} from "../events.js";
import {orderView} from "../projections/operations.js";

const WINDOW_SECONDS=Number(process.env.CAPACITY_WINDOW_SECONDS??900);

function window(now=new Date()){
 const start=Math.floor(now.getTime()/1000/WINDOW_SECONDS)*WINDOW_SECONDS*1000;
 return{windowStartAt:new Date(start).toISOString(),windowEndAt:new Date(start+WINDOW_SECONDS*1000).toISOString()};
}

function eligibleDrivers(city:string){
 refreshLocationSessions();
 const now=new Date();
 return [...drivers.values()].filter((d:Driver)=>{
  const shift=d.sessionId?shifts.get(d.sessionId):undefined;
  if(d.city!==city||d.status!=="AVAILABLE"||!d.location||!d.sessionId||!shift)return false;
  if(Date.parse(shift.endsAt)<=now.getTime())return false;
  if(d.restUntil&&Date.parse(d.restUntil)>now.getTime())return false;
  const policy=isDispatchEligibleByPolicy(d.id,effectiveActiveSeconds(d,now),undefined);
  return policy.eligible;
 });
}

function activeReservations(city:string){
 return [...capacityReservations.values()].filter(x=>x.city===city&&x.status==="ACTIVE");
}

export function capacityForCity(city:string,now=new Date()){
 const eligible=eligibleDrivers(city);
 const committed=activeReservations(city);
 const w=window(now);
 const currentWindowReservations=committed.filter(x=>Date.parse(x.reservedAt)<=Date.parse(w.windowEndAt));
 return{
  city,
  windowStartAt:w.windowStartAt,
  windowEndAt:w.windowEndAt,
  eligibleDrivers:eligible.length,
  committedReservations:committed.length,
  availableCapacity:Math.max(eligible.length-committed.length,0),
  committedInCurrentWindow:currentWindowReservations.length
 };
}

export function reserveCapacityForOrder(orderId:string){
 let result:{reserved:boolean;reservation?:CapacityReservation;capacity:any}|undefined;
 transaction(()=>{
  const order=orders.get(orderId);
  if(!order)throw Error("Pedido não encontrado");
  const company=companies.get(order.companyId);
  if(!company)throw Error("Empresa não encontrada");
  const existing=order.capacityReservationId?capacityReservations.get(order.capacityReservationId):undefined;
  if(existing?.status==="ACTIVE"){result={reserved:true,reservation:existing,capacity:capacityForCity(company.city)};return}
  const capacity=capacityForCity(company.city);
  const candidateAvailable=rankCandidates(order.pickup).length>0;
  if(capacity.availableCapacity<=0||!candidateAvailable){
   order.capacityStatus="INSUFFICIENT";
   emitDomainEvent({type:"CapacityInsufficient",aggregateType:"order",aggregateId:order.id,payload:{serviceId:order.id,city:company.city,capacity},projections:[orderView(order)]});
   result={reserved:false,capacity};
   return;
  }
  const now=new Date();
  const w=window(now);
  const reservation:CapacityReservation={
   id:crypto.randomUUID(),
   orderId:order.id,
   city:company.city,
   reservedAt:now.toISOString(),
   status:"ACTIVE"
  };
  capacityReservations.set(reservation.id,reservation);
  order.capacityReservationId=reservation.id;
  order.capacityStatus="PROMISED";
  emitDomainEvent({type:"CapacityReserved",aggregateType:"order",aggregateId:order.id,payload:{serviceId:order.id,reservationId:reservation.id,city:company.city,windowStartAt:w.windowStartAt,windowEndAt:w.windowEndAt,capacity},projections:[orderView(order)]});
  result={reserved:true,reservation,capacity};
 });
 changed();
 return result!;
}

export function releaseCapacityForOrder(orderId:string){
 let released=false;
 transaction(()=>{
  const order=orders.get(orderId);
  if(!order?.capacityReservationId)return;
  const reservation=capacityReservations.get(order.capacityReservationId);
  if(reservation?.status==="ACTIVE"){
   reservation.status="RELEASED";
   reservation.releasedAt=new Date().toISOString();
   released=true;
   emitDomainEvent({type:"CapacityReleased",aggregateType:"order",aggregateId:order.id,payload:{serviceId:order.id,reservationId:reservation.id,city:reservation.city},projections:[orderView(order)]});
  }
  order.capacityStatus="RELEASED";
 });
 if(released)changed();
 return released;
}

export function capacityCities(){
 return [...new Set([...companies.values()].map(c=>c.city))].map(city=>capacityForCity(city));
}
