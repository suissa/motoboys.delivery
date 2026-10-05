import test from "node:test";
import assert from "node:assert/strict";
import {drivers} from "../../src/store.js";
import {distanceKm} from "../../src/services/geo.js";
import {rankCandidates} from "../../src/services/queue.js";
import {startShift,enforceRest} from "../../src/services/shifts.js";
import {parseIncoming} from "../../src/services/whatsapp.js";
import {createPix,confirmPayment,expirePayment} from "../../src/services/payments.js";
import {createOrder,onPaymentConfirmed,completeOrder} from "../../src/services/orders.js";
import {resetState} from "../helpers/reset.js";

const scenario=(name:string,fn:()=>void|Promise<void>)=>test("Scenario: "+name,fn);
test.beforeEach(resetState);

scenario("Given two motoboys with different fairness rates, When dispatch is needed, Then the lower rate is selected",()=>{
 for(const d of drivers.values()){d.status="AVAILABLE";d.location={lat:-24.112,lng:-49.334};d.activeSecondsToday=3600}
 drivers.get("moto-01")!.completedToday=4;drivers.get("moto-02")!.completedToday=1;
 assert.equal(rankCandidates({lat:-24.113,lng:-49.333})[0].driver.id,"moto-02");
});
scenario("Given pickup and destination coordinates, When distance is requested, Then ETA can be derived",()=>{
 const km=distanceKm({lat:-24.112,lng:-49.334},{lat:-24.115,lng:-49.330}); assert(km>0);
});
scenario("Given a driver starting a shift, When rest is requested, Then the driver enters RESTING",()=>{
 const d=drivers.get("moto-01")!;startShift(d.id,60);enforceRest(d.id);assert.equal(d.status,"RESTING");
});
scenario("Given a WhatsApp webhook message, When it contains location and media, Then both are parsed",()=>{
 const m=parseIncoming({message:{from:"x",text:{body:"ok"},location:{latitude:"1",longitude:"2"},image:{url:"photo"}});assert.deepEqual(m.location,{lat:1,lng:2});assert.equal(m.mediaUrl,"photo");
});
scenario("Given a pending Pix charge, When payment is confirmed, Then it becomes PAID",async()=>{
 process.env.FINANCIAL_API="http://127.0.0.1:9";const p=await createPix("bdd",10);confirmPayment(p.id);assert.equal(p.status,"PAID");
});
scenario("Given a pending Pix charge, When it expires, Then it becomes EXPIRED",async()=>{
 process.env.FINANCIAL_API="http://127.0.0.1:9";const p=await createPix("bdd-exp",10);assert.equal(expirePayment(p.id),true);assert.equal(p.status,"EXPIRED");
});
scenario("Given a paid order and an available driver, When dispatch runs, Then the order is assigned",async()=>{
 process.env.FINANCIAL_API="http://127.0.0.1:9";for(const d of drivers.values()){d.status="AVAILABLE";d.location={lat:-24.112,lng:-49.334}}
 const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"x",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});confirmPayment(payment.id);const result=await onPaymentConfirmed(payment.id);assert.equal(result.id,order.id);assert.equal(result.status,"ASSIGNED");
});
scenario("Given an assigned order with a confirmation code, When the code is valid, Then the delivery completes",async()=>{
 process.env.FINANCIAL_API="http://127.0.0.1:9";for(const d of drivers.values()){d.status="AVAILABLE";d.location={lat:-24.112,lng:-49.334}}
 const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"x",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});confirmPayment(payment.id);const result=await onPaymentConfirmed(payment.id);result.confirmationCode="654321";result.status="AWAITING_CONFIRMATION";assert.equal(completeOrder(order.id,"654321"),true);assert.equal(order.status,"COMPLETED");
});
