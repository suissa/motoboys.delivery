import type {OrderStatus,ProviderType,TwinActorType} from "../domain.js";
import {validTransitions} from "../services/dispatch.js";

export type CanonicalIntent="REQUEST_DELIVERY"|"PAY_FOR_DELIVERY"|"ACCEPT_DISPATCH"|"PROGRESS_DELIVERY"|"CONFIRM_DELIVERY";
export type CanonicalAction="CREATE_SERVICE"|"CREATE_PAYMENT"|"CONFIRM_PAYMENT"|"OFFER_DRIVER"|"ACCEPT_OFFER"|"REJECT_OFFER"|"CONFIRM_PICKUP"|"START_TRANSIT"|"CONFIRM_ARRIVAL"|"REQUEST_CONFIRMATION"|"COMPLETE_SERVICE";
export type CanonicalAgent="CUSTOMER"|"DRIVER"|"DISPATCH_AGENT"|"FINANCE_AGENT"|"NETWORK_AGENT";
export type CanonicalChannel="HTTP_API"|"WHATSAPP";
export type CanonicalFlow=OrderStatus[];

export interface CanonicalScenario{
 name:string;
 intent:CanonicalIntent;
 agent:CanonicalAgent;
 channel:CanonicalChannel;
 actions:CanonicalAction[];
 flow:CanonicalFlow;
 twinActors:TwinActorType[];
 providerTypes:ProviderType[];
}

export const DELIVERY_SCENARIO:CanonicalScenario={
 name:"paid-delivery",
 intent:"REQUEST_DELIVERY",
 agent:"DISPATCH_AGENT",
 channel:"HTTP_API",
 actions:[
  "CREATE_SERVICE","CREATE_PAYMENT","CONFIRM_PAYMENT","OFFER_DRIVER",
  "ACCEPT_OFFER","CONFIRM_PICKUP","START_TRANSIT","CONFIRM_ARRIVAL",
  "REQUEST_CONFIRMATION","COMPLETE_SERVICE"
 ],
 flow:["AWAITING_PAYMENT","SEARCHING_DRIVER","OFFERED","ASSIGNED","PICKED_UP","IN_TRANSIT","ARRIVED","AWAITING_CONFIRMATION","COMPLETED"],
 twinActors:["CUSTOMER","DRIVER"],
 providerTypes:["COMPANY","INDEPENDENT"]
};

export function isCanonicalTransition(from:OrderStatus,to:OrderStatus){
 return validTransitions[from]?.includes(to)??false;
}

export function assertCanonicalScenario(scenario:CanonicalScenario){
 if(scenario.actions.length<1)throw Error("Canonical scenario sem actions");
 if(scenario.flow.length<2)throw Error("Canonical scenario sem flow");
 for(let i=1;i<scenario.flow.length;i++){
  if(!isCanonicalTransition(scenario.flow[i-1],scenario.flow[i]))throw Error(`Transição canônica inválida: ${scenario.flow[i-1]} → ${scenario.flow[i]}`);
 }
 if(!scenario.twinActors.includes("CUSTOMER")||!scenario.twinActors.includes("DRIVER"))throw Error("Canonical scenario deve ter os dois Twins");
 if(!scenario.providerTypes.includes("COMPANY")||!scenario.providerTypes.includes("INDEPENDENT"))throw Error("Canonical scenario deve cobrir rede multi-provider");
 return true;
}
