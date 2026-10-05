import crypto from "node:crypto";
import {appendStoredEvent,applyProjection,clearProjections,readDomainEvents,readEntities,readEventProjections,readProjection,transaction,type ProjectionUpdate} from "./persistence/database.js";
import {companyView,driverView,orderView,paymentView,providerView,shiftView,workPolicyView,OPERATIONS_PROJECTION} from "./projections/operations.js";
import type {Company,ConversationalTwin,Driver,Order,Payment,Provider,Shift,WorkPolicy} from "./domain.js";

export type DomainEventType=
|"ProjectionBaselineCreated"
|"ServiceRequested"
|"PaymentRequested"
|"PaymentLinked"
|"PaymentConfirmed"
|"PaymentExpired"
|"CandidateEvaluated"
|"DispatchAccepted"
|"DispatchOffered"
|"DispatchRejected"
|"DispatchTimedOut"
|"LocationShared"
|"LocationSessionExpired"
|"LocationSessionEnded"
|"PickupConfirmed"
|"PickupPhotoReceived"
|"TransitStarted"
|"DriverArrived"
|"DeliveryConfirmed"
|"DeliveryCancelled"
|"ConfirmationRequested"
|"ShiftStarted"
|"RestStarted"
|"RestEnded"
|"ShiftEnded"
|"WorkTimeAccumulated"
|"WorkDayRolledOver"
|"WorkPolicyChanged"
|"CapacityReserved"
|"CapacityReleased"
|"CapacityInsufficient"
|"ProviderRegistered"
|"ProviderUpdated"
|"TwinCreated"
|"TwinContextUpdated"
|"TwinContextClosed";

export type DomainEventAggregate="service"|"order"|"payment"|"driver"|"shift"|"provider"|"twin"|"message";

export function emitDomainEvent(input:{
 type:DomainEventType;
 aggregateType:DomainEventAggregate;
 aggregateId:string;
 payload:Record<string,unknown>;
 projections?:ProjectionUpdate[];
}){
 const occurredAt=new Date().toISOString();
 const eventId=crypto.randomUUID();
 appendStoredEvent({
  eventId,
  eventType:input.type,
  aggregateType:input.aggregateType,
  aggregateId:input.aggregateId,
  payload:input.payload,
  occurredAt,
  projections:input.projections??[]
 });
 return{eventId,type:input.type,aggregateType:input.aggregateType,aggregateId:input.aggregateId,occurredAt};
}

export function rebuildOperationalProjections(){
 transaction(()=>{
  clearProjections();
  for(const event of readDomainEvents()){
   for(const projection of readEventProjections(event.event_id))applyProjection(projection);
  }
 });
}

export function ensureDomainEventBaseline(){
 if(readDomainEvents().length>0)return;
 const views:ProjectionUpdate[]=[];
 const companies=readEntities("companies") as unknown as Company[];
 const providers=readEntities("providers") as unknown as Provider[];
 const drivers=readEntities("drivers") as unknown as Driver[];
 const shifts=readEntities("shifts") as unknown as Shift[];
 const orders=readEntities("orders") as unknown as Order[];
 const payments=readEntities("payments") as unknown as Payment[];
 const workPolicies=readEntities("work_policies") as unknown as WorkPolicy[];
 const twins=readEntities("twins") as unknown as ConversationalTwin[];
 for(const row of companies)views.push(companyView(row));
 for(const row of providers)views.push(providerView(row));
 for(const row of drivers)views.push(driverView(row));
 for(const row of shifts)views.push(shiftView(row));
 for(const row of orders)views.push(orderView(row));
 for(const row of payments)views.push(paymentView(row));
 for(const row of workPolicies)views.push(workPolicyView(row));
 for(const row of twins)views.push({projectionName:OPERATIONS_PROJECTION,collection:"twins",entityId:row.id,state:{id:row.id,serviceId:row.serviceId,actorType:row.actorType,actorId:row.actorId,channel:row.channel,contextVersion:row.contextVersion,state:row.state,lastInboundAt:row.lastInboundAt,lastOutboundAt:row.lastOutboundAt,lastMessageId:row.lastMessageId,lastCorrelationId:row.lastCorrelationId}});
 if(!views.length)return;
 transaction(()=>{
  for(const view of views){
   const aggregateType=view.collection==="orders"?"order":view.collection==="payments"?"payment":view.collection==="drivers"?"driver":view.collection==="shifts"?"shift":view.collection==="providers"?"provider":view.collection==="twins"?"twin":"driver";
   emitDomainEvent({
    type:"ProjectionBaselineCreated",
    aggregateType:aggregateType as DomainEventAggregate,
    aggregateId:view.entityId,
    payload:{source:"persisted-state-baseline"},
    projections:[view]
   });
  }
 });
}

export function operationalProjection(collection:string){
 return readProjection(OPERATIONS_PROJECTION,collection).map((x:any)=>x.state);
}
