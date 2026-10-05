import type {WorkPolicy} from "../domain.js";
import {changed,transaction,workPolicies} from "../store.js";
import {emitDomainEvent} from "../events.js";import {workPolicyView} from "../projections/operations.js";

const DEFAULT_MAX_SHIFT=4*60*60;
const DEFAULT_REST=60*60;

function defaults(driverId:string):WorkPolicy{
 return{driverId,maxShiftSeconds:DEFAULT_MAX_SHIFT,requiredRestSeconds:DEFAULT_REST,enabled:true};
}

export function getWorkPolicy(driverId:string){
 const existing=workPolicies.get(driverId);
 if(existing)return existing;
 const policy=defaults(driverId);
 transaction(()=>{workPolicies.set(driverId,policy);emitDomainEvent({type:"WorkPolicyChanged",aggregateType:"driver",aggregateId:driverId,payload:{driverId,maxShiftSeconds:policy.maxShiftSeconds,requiredRestSeconds:policy.requiredRestSeconds,dailyGoalDeliveries:policy.dailyGoalDeliveries,enabled:policy.enabled},projections:[workPolicyView(policy)]})});
 return workPolicies.get(driverId)!;
}

export function setWorkPolicy(driverId:string,input:Partial<Omit<WorkPolicy,"driverId">>){
 const current=getWorkPolicy(driverId);
 const next:WorkPolicy={
  driverId,
  maxShiftSeconds:Math.max(60,Number(input.maxShiftSeconds??current.maxShiftSeconds)),
  requiredRestSeconds:Math.max(0,Number(input.requiredRestSeconds??current.requiredRestSeconds)),
  dailyGoalDeliveries:input.dailyGoalDeliveries===undefined?current.dailyGoalDeliveries:Math.max(0,Number(input.dailyGoalDeliveries)),
  enabled:input.enabled===undefined?current.enabled:Boolean(input.enabled)
 };
 transaction(()=>{
  workPolicies.set(driverId,next);
  emitDomainEvent({type:"WorkPolicyChanged",aggregateType:"driver",aggregateId:driverId,payload:{
   driverId,maxShiftSeconds:next.maxShiftSeconds,requiredRestSeconds:next.requiredRestSeconds,
   dailyGoalDeliveries:next.dailyGoalDeliveries,enabled:next.enabled
  },projections:[workPolicyView(next)]});
 });
 changed();
 return workPolicies.get(driverId)!;
}

export function isDispatchEligibleByPolicy(driverId:string,activeSeconds:number,shiftEndsAt?:string){
 const policy=getWorkPolicy(driverId);
 if(!policy.enabled)return{eligible:false,reason:"policy_disabled",policy};
 if(shiftEndsAt&&Date.parse(shiftEndsAt)<=Date.now())return{eligible:false,reason:"shift_limit_reached",policy};
 if(activeSeconds>=policy.maxShiftSeconds)return{eligible:false,reason:"active_work_limit_reached",policy};
 return{eligible:true,policy};
}
