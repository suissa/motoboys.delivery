import crypto from "node:crypto";
import type {LatLng,LocationPurpose,LocationScope} from "../domain.js";
import {drivers,locationSessions,changed,transaction} from "../store.js";
import {emitDomainEvent} from "../events.js";
import {driverView} from "../projections/operations.js";

const NETWORK_TTL=Number(process.env.LOCATION_NETWORK_TTL_SECONDS??300);
const SERVICE_TTL=Number(process.env.LOCATION_SERVICE_TTL_SECONDS??900);

function ttl(scope:LocationScope){return scope==="SERVICE"?SERVICE_TTL:NETWORK_TTL}

export function refreshLocationSessions(now=new Date()){
 let expired=0;
 transaction(()=>{
  for(const session of locationSessions.values()){
   if(Date.parse(session.expiresAt)>now.getTime())continue;
   locationSessions.delete(session.id);
   if(session.actorType==="DRIVER"){
    const d=drivers.get(session.actorId);
    if(d){
     delete d.location;
     delete d.locationAt;
     emitDomainEvent({type:"LocationSessionExpired",aggregateType:"driver",aggregateId:d.id,payload:{driverId:d.id,sessionId:session.id,serviceId:session.serviceId},projections:[driverView(d)]});
    }
   }
   expired++;
  }
 });
 if(expired)changed();
 return expired;
}

export function shareDriverLocation(driverId:string,location:LatLng,input?:{purpose?:LocationPurpose;serviceId?:string;scope?:LocationScope}){
 let result;
 transaction(()=>{
  const d=drivers.get(driverId);
  if(!d)throw Error("Motoboy não encontrado");
  const purpose=input?.purpose??(input?.serviceId?"ACTIVE_SERVICE":"WORK_START");
  const scope=input?.scope??(input?.serviceId?"SERVICE":"NETWORK");
  const now=new Date();
  const current=[...locationSessions.values()].find(x=>x.actorType==="DRIVER"&&x.actorId===driverId);
  const session=current??{
   id:crypto.randomUUID(),
   actorType:"DRIVER" as const,
   actorId:driverId,
   startedAt:now.toISOString(),
   expiresAt:new Date(now.getTime()+ttl(scope)*1000).toISOString(),
   purpose,
   scope,
   serviceId:input?.serviceId
  };
  session.purpose=purpose;
  session.scope=scope;
  session.serviceId=input?.serviceId??session.serviceId;
  session.expiresAt=new Date(now.getTime()+ttl(scope)*1000).toISOString();
  d.location=location;
  d.locationAt=now.toISOString();
  locationSessions.set(session.id,session);
  emitDomainEvent({
   type:"LocationShared",
   aggregateType:"driver",
   aggregateId:d.id,
   payload:{driverId:d.id,sessionId:session.id,serviceId:session.serviceId,purpose,scope},
   projections:[driverView(d)]
  });
  result={session,driver:d};
 });
 changed();
 return result!;
}

export function beginServiceLocation(driverId:string,serviceId:string){
 const d=drivers.get(driverId);
 if(!d?.location)return undefined;
 return shareDriverLocation(driverId,d.location,{purpose:"DISPATCH",serviceId,scope:"SERVICE"});
}

export function endDriverLocation(driverId:string,serviceId?:string){
 let ended=false;
 transaction(()=>{
  for(const session of [...locationSessions.values()]){
   if(session.actorType!=="DRIVER"||session.actorId!==driverId)continue;
   if(serviceId&&session.serviceId&&session.serviceId!==serviceId)continue;
   locationSessions.delete(session.id);
   ended=true;
  }
  const d=drivers.get(driverId);
  if(d){delete d.location;delete d.locationAt;emitDomainEvent({type:"LocationSessionEnded",aggregateType:"driver",aggregateId:driverId,payload:{driverId,serviceId},projections:[driverView(d)]})}
 });
 if(ended)changed();
 return ended;
}

export function activeDriverLocation(driverId:string,now=new Date()){
 refreshLocationSessions(now);
 const session=[...locationSessions.values()].find(x=>x.actorType==="DRIVER"&&x.actorId===driverId&&Date.parse(x.expiresAt)>now.getTime());
 const d=drivers.get(driverId);
 if(!session||!d?.location)return undefined;
 return{session,location:d.location};
}
