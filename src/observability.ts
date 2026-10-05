import crypto from "node:crypto";
import {AsyncLocalStorage} from "node:async_hooks";
import {readDomainEvents} from "./persistence/database.js";

export type ObservabilityContext={correlationId:string;serviceId?:string};
const storage=new AsyncLocalStorage<ObservabilityContext>();

export function newCorrelationId(){return crypto.randomUUID()}

export function runWithObservabilityContext<T>(context:ObservabilityContext,work:()=>T){
 return storage.run(context,work);
}

export function currentObservabilityContext(){
 return storage.getStore();
}

const SECRET_KEYS=new Set(["phone","customerPhone","pixCopyPaste","qrCodeDataUrl","accessToken","authorization","token","secret","appSecret","verifyToken","rawBody"]);
const PRIVATE_KEYS=new Set(["location","pickup","destination"]);

export function sanitizeForLog(value:unknown):unknown{
 if(value===null||typeof value!=="object")return value;
 if(Array.isArray(value))return value.map(sanitizeForLog);
 const result:Record<string,unknown>={};
 for(const [key,val] of Object.entries(value as Record<string,unknown>)){
  if(SECRET_KEYS.has(key)||PRIVATE_KEYS.has(key))continue;
  result[key]=sanitizeForLog(val);
 }
 return result;
}

export function log(level:"info"|"warn"|"error",event:string,data:Record<string,unknown>={}){
 const context=currentObservabilityContext();
 const payload=sanitizeForLog({
  timestamp:new Date().toISOString(),
  level,
  event,
  correlationId:context?.correlationId,
  serviceId:context?.serviceId,
  ...data
 });
 console.log(JSON.stringify(payload));
}

function eventServiceId(event:any){
 const payload=JSON.parse(event.payload_json??"{}");
 return payload.serviceId??(event.aggregate_type==="service"||event.aggregate_type==="order"?event.aggregate_id:undefined);
}

export function serviceAuditTimeline(serviceId:string){
 return readDomainEvents()
  .filter((event:any)=>eventServiceId(event)===serviceId)
  .map((event:any)=>({
   sequence:event.sequence,
   eventId:event.event_id,
   type:event.event_type,
   aggregateType:event.aggregate_type,
   aggregateId:event.aggregate_id,
   occurredAt:event.occurred_at,
   transactionId:event.transaction_id,
   correlationId:(JSON.parse(event.payload_json??"{}").correlationId??undefined),
   payload:sanitizeForLog(JSON.parse(event.payload_json??"{}"))
  }));
}
