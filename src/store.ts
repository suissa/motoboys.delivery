import type {Company,Driver,Order,Payment,Shift,WorkPolicy,LocationSession,CapacityReservation,Provider,ConversationalTwin} from "./domain.js";
import {clearCollection,deleteEntity,entityExists,history,readEntity,readEntities,resetDatabase as resetPersistentDatabase,setEntity,transaction,updateEntityProperty} from "./persistence/database.js";

type Entity={id:string}&Record<string,unknown>;

class PersistentMap<T extends Entity>{
  constructor(private readonly collection:string){}
  get(id:string){
    const state=readEntity(this.collection,id);
    if(!state)return undefined;
    return this.proxy(state as T);
  }
  has(id:string){return entityExists(this.collection,id)}
  set(id:string,value:T){
    setEntity(this.collection,id,JSON.parse(JSON.stringify(value)) as Record<string,unknown>);
    return this;
  }
  delete(id:string){const existed=this.has(id);if(existed)deleteEntity(this.collection,id);return existed}
  clear(){clearCollection(this.collection)}
  get size(){return readEntities(this.collection).length}
  values(){
    const rows=readEntities(this.collection);
    return rows.map(row=>this.proxy(row as T)).values();
  }
  keys(){return readEntities(this.collection).map(x=>String(x.id)).values()}
  entries(){
    return readEntities(this.collection).map(row=>{
      const value=this.proxy(row as T);
      return [String(row.id),value] as [string,T];
    }).values();
  }
  [Symbol.iterator](){return this.entries()}
  private proxy(state:T):T{
    const collection=this.collection;
    const id=String(state.id);
    return new Proxy(state,{
      set(target,property,value){
        if(typeof property!=="string")return Reflect.set(target,property,value);
        updateEntityProperty(collection,id,property,value);
        if(value===undefined)delete (target as Record<string,unknown>)[property];
        else (target as Record<string,unknown>)[property]=value;
        return true;
      },
      deleteProperty(target,property){
        if(typeof property!=="string")return Reflect.deleteProperty(target,property);
        updateEntityProperty(collection,id,property,undefined);
        delete (target as Record<string,unknown>)[property];
        return true;
      }
    });
  }
}

export const companies=new PersistentMap<Company>("companies");
export const drivers=new PersistentMap<Driver>("drivers");
export const shifts=new PersistentMap<Shift>("shifts");
export const orders=new PersistentMap<Order>("orders");
export const payments=new PersistentMap<Payment>("payments");
export const workPolicies=new PersistentMap<WorkPolicy>("work_policies");
export const locationSessions=new PersistentMap<LocationSession>("location_sessions");
export const capacityReservations=new PersistentMap<CapacityReservation>("capacity_reservations");
export const providers=new PersistentMap<Provider>("providers");
export const twins=new PersistentMap<ConversationalTwin>("twins");

const listeners=new Set<()=>void>();
export function changed(){for(const listener of listeners)listener()}
export function subscribe(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener)}
export {transaction};

const seeds={
  providers:[
    {id:"company-demo",name:"Empresa Demo",type:"COMPANY",city:"Itararé",phone:"5515999991000",enabled:true,createdAt:"2026-10-05T00:00:00.000Z"},
    {id:"provider-independent-demo",name:"Independentes Itararé",type:"INDEPENDENT",city:"Itararé",enabled:true,createdAt:"2026-10-05T00:00:00.000Z"}
  ],
  companies:[
    {id:"company-demo",name:"Empresa Demo",city:"Itararé",phone:"5515999991000"}
  ],
  drivers:[
    {id:"moto-01",name:"Carlos",phone:"5515999990001",companyId:"company-demo",providerId:"company-demo",city:"Itararé",status:"OFFLINE",completedToday:0,activeSecondsToday:0,earnedToday:0,deliveries:0},
    {id:"moto-02",name:"Rafael",phone:"5515999990002",companyId:"company-demo",providerId:"company-demo",city:"Itararé",status:"OFFLINE",completedToday:0,activeSecondsToday:0,earnedToday:0,deliveries:0},
    {id:"moto-03",name:"Marcos",phone:"5515999990003",providerId:"provider-independent-demo",city:"Itararé",status:"OFFLINE",completedToday:0,activeSecondsToday:0,earnedToday:0,deliveries:0}
  ],
  shifts:[],
  location_sessions:[],
  capacity_reservations:[],
  providers:[],
  twins:[],
  work_policies:[
    {id:"moto-01",driverId:"moto-01",maxShiftSeconds:4*60*60,requiredRestSeconds:60*60,enabled:true},
    {id:"moto-02",driverId:"moto-02",maxShiftSeconds:4*60*60,requiredRestSeconds:60*60,enabled:true},
    {id:"moto-03",driverId:"moto-03",maxShiftSeconds:4*60*60,requiredRestSeconds:60*60,enabled:true}
  ],
  orders:[],
  payments:[]
} satisfies Record<string,Record<string,unknown>[]>;

function ensureSeeds(){
  if(providers.size===0)for(const p of seeds.providers)setEntity("providers",p.id,p);
  if(companies.size===0)setEntity("companies","company-demo",seeds.companies[0]);
  if(drivers.size===0)for(const d of seeds.drivers)setEntity("drivers",d.id,d);
  if(workPolicies.size===0)for(const policy of seeds.work_policies)setEntity("work_policies",policy.id,policy);
}

ensureSeeds();

export function resetStore(){
  resetPersistentDatabase(seeds);
}

export function stateHistory(collection?:string){return history(collection)}
