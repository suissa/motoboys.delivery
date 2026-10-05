import {providers,drivers,changed,transaction} from "../store.js";
import type {Provider,ProviderType} from "../domain.js";
import {emitDomainEvent} from "../events.js";
import {providerView,driverView} from "../projections/operations.js";

export function providerForDriver(driverId:string){
 const d=drivers.get(driverId);
 if(!d)return undefined;
 const providerId=d.providerId??d.companyId;
 return providerId?providers.get(providerId):undefined;
}

export function getProvider(providerId:string){
 return providers.get(providerId);
}

export function listProviders(city?:string){
 return [...providers.values()].filter(p=>p.enabled&&(!city||p.city===city));
}

export function registerProvider(input:{id?:string;name:string;type:ProviderType;city:string;phone?:string}){
 const id=input.id??crypto.randomUUID();
 const provider:Provider={id,name:input.name,type:input.type,city:input.city,phone:input.phone,enabled:true,createdAt:new Date().toISOString()};
 transaction(()=>{
  if(providers.has(id))throw Error("Provider já existe");
  providers.set(id,provider);
  emitDomainEvent({type:"ProviderRegistered",aggregateType:"provider",aggregateId:id,payload:{providerId:id,name:provider.name,type:provider.type,city:provider.city},projections:[providerView(provider)]});
 });
 changed();
 return providers.get(id)!;
}

export function setProviderEnabled(providerId:string,enabled:boolean){
 const provider=providers.get(providerId);
 if(!provider)throw Error("Provider não encontrado");
 transaction(()=>{
  provider.enabled=enabled;
  emitDomainEvent({type:"ProviderUpdated",aggregateType:"provider",aggregateId:providerId,payload:{providerId,enabled},projections:[providerView(provider)]});
 });
 if(!enabled){
  transaction(()=>{
   for(const d of drivers.values())if((d.providerId??d.companyId)===providerId&&d.status!=="OFFLINE"){
    d.status="OFFLINE";
    emitDomainEvent({type:"ProviderUpdated",aggregateType:"provider",aggregateId:providerId,payload:{providerId,driverId:d.id,enabled:false},projections:[providerView(provider),driverView(d)]});
   }
  });
 }
 changed();
 return providers.get(providerId)!;
}

export function providerCapacity(city:string){
 return listProviders(city).map(provider=>{
  const activeDrivers=[...drivers.values()].filter(d=>(d.providerId??d.companyId)===provider.id&&d.city===city&&d.status==="AVAILABLE");
  return{providerId:provider.id,providerName:provider.name,providerType:provider.type,eligibleDrivers:activeDrivers.length};
 });
}
