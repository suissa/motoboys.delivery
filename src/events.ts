import crypto from "node:crypto";
import {
  applyProjection,
  clearProjections,
  readDomainEvents,
  readEntities,
  readEventProjections,
  transaction,
  type ProjectionUpdate
} from "./persistence/database.js";
import {appendStoredEvent,readProjection} from "./persistence/database.js";
import {companyView,driverView,orderView,paymentView,shiftView,workPolicyView,OPERATIONS_PROJECTION} from "./projections/operations.js";
import type {Company,Driver,Order,Payment,Shift,WorkPolicy} from "./domain.js";

export type DomainEventType=
  |"ProjectionBaselineCreated"
  |"ServiceRequested"
  |"PaymentRequested"
  |"PaymentLinked"
  |"PaymentConfirmed"
  |"PaymentExpired"
  |"CandidateEvaluated"
  |"DispatchAccepted"
  |"LocationShared"
  |"PickupConfirmed"
  |"PickupPhotoReceived"
  |"DeliveryConfirmed"
  |"ConfirmationRequested"
  |"ShiftStarted"
  |"RestStarted"
  |"RestEnded"
  |"ShiftEnded"
  |"WorkTimeAccumulated"
  |"WorkDayRolledOver"
  |"WorkPolicyChanged"
  |"LocationSessionExpired"
  |"LocationSessionEnded";

export type DomainEventAggregate="service"|"order"|"payment"|"driver"|"shift";

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
  const projectionByCollection:Record<string,ProjectionUpdate>={};
  const baseline=(
    collection:string,
    row:Record<string,unknown>,
    view:ProjectionUpdate
  )=>{
    const id=String(row.id);
    const key=collection+":"+id;
    projectionByCollection[key]=view;
  };
  const companies=readEntities("companies") as unknown as Company[];
  const drivers=readEntities("drivers") as unknown as Driver[];
  const shifts=readEntities("shifts") as unknown as Shift[];
  const orders=readEntities("orders") as unknown as Order[];
  const payments=readEntities("payments") as unknown as Payment[];
  const workPolicies=readEntities("work_policies") as unknown as WorkPolicy[];
  for(const row of companies)baseline("companies",row,companyView(row));
  for(const row of drivers)baseline("drivers",row,driverView(row));
  for(const row of shifts)baseline("shifts",row,shiftView(row));
  for(const row of orders)baseline("orders",row,orderView(row));
  for(const row of payments)baseline("payments",row,paymentView(row));
  for(const row of workPolicies)baseline("work_policies",row,workPolicyView(row));
  const views=Object.values(projectionByCollection);
  if(!views.length)return;
  transaction(()=>{
    for(const view of views){
      emitDomainEvent({
        type:"ProjectionBaselineCreated",
        aggregateType:view.collection==="orders"?"order":view.collection==="payments"?"payment":view.collection==="drivers"?"driver":view.collection==="shifts"?"shift":"driver",
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
