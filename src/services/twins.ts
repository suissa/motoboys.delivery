import crypto from "node:crypto";
import type {ConversationalTwin,TwinActorType} from "../domain.js";
import {twins,orders,drivers,changed,transaction} from "../store.js";
import {emitDomainEvent} from "../events.js";
import {whatsapp} from "./whatsapp.js";

function twinId(serviceId:string,actorType:TwinActorType,actorId:string){return `${serviceId}:${actorType}:${actorId}`}

export function ensureTwin(serviceId:string,actorType:TwinActorType,actorId:string,phone:string){
 const id=twinId(serviceId,actorType,actorId);
 const existing=twins.get(id);
 if(existing)return existing;
 const twin:ConversationalTwin={
  id,serviceId,actorType,actorId,channel:"WHATSAPP",phone,contextVersion:1,state:"ACTIVE"
 };
 transaction(()=>{
  twins.set(id,twin);
  emitDomainEvent({
   type:"TwinCreated",
   aggregateType:"twin",
   aggregateId:id,
   payload:{serviceId,actorType,actorId,channel:"WHATSAPP",contextVersion:1},
   projections:[twinView(twin)]
  });
 });
 changed();
 return twins.get(id)!;
}

export function twinForService(serviceId:string,actorType:TwinActorType){
 return [...twins.values()].find(t=>t.serviceId===serviceId&&t.actorType===actorType&&t.state==="ACTIVE");
}

export function observeInbound(serviceId:string,actorType:TwinActorType,actorId:string,phone:string,input:{messageId?:string;correlationId?:string;intent?:string}){
 const twin=ensureTwin(serviceId,actorType,actorId,phone);
 transaction(()=>{
  twin.contextVersion++;
  twin.lastInboundAt=new Date().toISOString();
  twin.lastMessageId=input.messageId;
  twin.lastCorrelationId=input.correlationId;
  emitDomainEvent({
   type:"TwinContextUpdated",
   aggregateType:"twin",
   aggregateId:twin.id,
   payload:{serviceId,actorType,actorId,direction:"INBOUND",intent:input.intent,contextVersion:twin.contextVersion,correlationId:input.correlationId},
   projections:[twinView(twin)]
  });
 });
 changed();
 return twins.get(twin.id)!;
}

export async function sendTwinMessage(serviceId:string,actorType:TwinActorType,text?:string,location?:{lat:number;lng:number;title?:string;etaMinutes?:number}){
 const order=orders.get(serviceId);
 if(!order)throw Error("Serviço não encontrado");
 const actorId=actorType==="CUSTOMER"?order.customerPhone:order.assignedDriverId;
 if(!actorId)throw Error("Ator conversacional não identificado");
 let phone:string|undefined;
 if(actorType==="CUSTOMER")phone=order.customerPhone;
 else{
  const d=drivers.get(order.assignedDriverId!);
  phone=d?.phone;
 }
 if(!phone)throw Error("Telefone do ator não encontrado");
 const twin=ensureTwin(serviceId,actorType,actorId,phone);
 await whatsapp.send({to:phone,text,location});
 transaction(()=>{
  twin.contextVersion++;
  twin.lastOutboundAt=new Date().toISOString();
  emitDomainEvent({
   type:"TwinContextUpdated",
   aggregateType:"twin",
   aggregateId:twin.id,
   payload:{serviceId,actorType,actorId,direction:"OUTBOUND",contextVersion:twin.contextVersion},
   projections:[twinView(twin)]
  });
 });
 changed();
 return twins.get(twin.id)!;
}

export function closeServiceTwins(serviceId:string){
 transaction(()=>{
  for(const twin of twins.values()){
   if(twin.serviceId!==serviceId||twin.state==="CLOSED")continue;
   twin.state="CLOSED";
   twin.contextVersion++;
   emitDomainEvent({type:"TwinContextClosed",aggregateType:"twin",aggregateId:twin.id,payload:{serviceId,actorType:twin.actorType,contextVersion:twin.contextVersion},projections:[twinView(twin)]});
  }
 });
 changed();
}

export function twinContext(serviceId:string){
 const order=orders.get(serviceId);
 if(!order)return undefined;
 const driver=order.assignedDriverId?drivers.get(order.assignedDriverId):undefined;
 return{
  serviceId,
  status:order.status,
  providerId:order.assignedProviderId,
  driverId:driver?.id,
  driverName:driver?.name,
  customerActorId:order.customerPhone,
  customerPhoneAvailableToPlatform:true,
  shared:{pickup:order.pickup,destination:order.destination,assignedProviderId:order.assignedProviderId}
 };
}

function twinView(t:ConversationalTwin){
 return{
  projectionName:"operations",
  collection:"twins",
  entityId:t.id,
  state:{
   id:t.id,
   serviceId:t.serviceId,
   actorType:t.actorType,
   actorId:t.actorId,
   channel:t.channel,
   contextVersion:t.contextVersion,
   state:t.state,
   lastInboundAt:t.lastInboundAt,
   lastOutboundAt:t.lastOutboundAt,
   lastMessageId:t.lastMessageId,
   lastCorrelationId:t.lastCorrelationId
  }
 };
}
