import type {Company,Driver,Order,Payment,Shift} from "./domain.js";
export const companies=new Map<string,Company>([["company-demo",{id:"company-demo",name:"Empresa Demo",city:"Itararé",phone:"5515999991000"}]]);
export const drivers=new Map<string,Driver>([
["moto-01",{id:"moto-01",name:"Carlos",phone:"5515999990001",companyId:"company-demo",city:"Itararé",status:"OFFLINE",completedToday:0,activeSecondsToday:0,earnedToday:0,deliveries:0}],
["moto-02",{id:"moto-02",name:"Rafael",phone:"5515999990002",companyId:"company-demo",city:"Itararé",status:"OFFLINE",completedToday:0,activeSecondsToday:0,earnedToday:0,deliveries:0}],
["moto-03",{id:"moto-03",name:"Marcos",phone:"5515999990003",city:"Itararé",status:"OFFLINE",completedToday:0,activeSecondsToday:0,earnedToday:0,deliveries:0}]]);
export const shifts=new Map<string,Shift>(); export const orders=new Map<string,Order>(); export const payments=new Map<string,Payment>();
const listeners=new Set<()=>void>(); export function changed(){for(const l of listeners)l()} export function subscribe(l:()=>void){listeners.add(l);return()=>listeners.delete(l)}
