import test from "node:test";
import assert from "node:assert/strict";
import {distanceKm,etaMinutes} from "../../src/services/geo.js";
import {drivers} from "../../src/store.js";
import {deliveriesPerHour,rankCandidates} from "../../src/services/queue.js";
import {startShift,endShift,enforceRest,refreshRestStates} from "../../src/services/shifts.js";
import {parseIncoming} from "../../src/services/whatsapp.js";
import {createPix,confirmPayment,expirePayment} from "../../src/services/payments.js";
import {createOrder,onPaymentConfirmed,completeOrder} from "../../src/services/orders.js";
import {resetState} from "../helpers/reset.js";

test.beforeEach(resetState);

test("geo calculates distance and ETA",()=>{
 const km=distanceKm({lat:-24.112,lng:-49.334},{lat:-24.115,lng:-49.330});
 assert(km>0); assert.equal(etaMinutes(km,30),Math.max(1,Math.ceil(km/30*60)));
});

test("queue prioritizes fairness by deliveries per hour",()=>{
 for(const d of drivers.values()){d.status="AVAILABLE";d.location={lat:-24.112,lng:-49.334};d.activeSecondsToday=3600;d.sessionId="test-session"}
 drivers.get("moto-01")!.completedToday=4; drivers.get("moto-02")!.completedToday=1; drivers.get("moto-03")!.completedToday=2;
 assert.equal(deliveriesPerHour(drivers.get("moto-02")!),1);
 assert.equal(rankCandidates({lat:-24.113,lng:-49.333})[0].driver.id,"moto-02");
});

test("queue excludes unavailable, resting and distant drivers",()=>{
 for(const d of drivers.values()){d.status="AVAILABLE";d.location={lat:-24.112,lng:-49.334};d.activeSecondsToday=3600;d.sessionId="test-session"}
 drivers.get("moto-01")!.status="BUSY";
 drivers.get("moto-02")!.restUntil=new Date(Date.now()+60_000).toISOString();
 drivers.get("moto-03")!.location={lat:-24.5,lng:-49.9};
 assert.equal(rankCandidates({lat:-24.112,lng:-49.334}).length,0);
});

test("shift starts, enforces rest and ends",()=>{
 const d=drivers.get("moto-01")!; const s=startShift(d.id,10);
 assert.equal(d.status,"AVAILABLE"); assert.equal(s.status,"ACTIVE");
 enforceRest(d.id); assert.equal(d.status,"RESTING");
 d.restUntil=new Date(Date.now()-1000).toISOString(); refreshRestStates(); assert.equal(d.status,"AVAILABLE");
 endShift(d.id); assert.equal(d.status,"OFFLINE");
});

test("whatsapp parser accepts text, location and media",()=>{
 assert.equal(parseIncoming({message:{from:"x",text:{body:"oi"}}).text,"oi");
 assert.deepEqual(parseIncoming({message:{from:"x",location:{latitude:"1",longitude:"2"}}).location,{lat:1,lng:2});
 assert.equal(parseIncoming({message:{from:"x",image:{url:"u"}}).mediaUrl,"u");
});

test("pix lifecycle creates, confirms and expires",async()=>{
 process.env.FINANCIAL_API="http://127.0.0.1:9";
 const p=await createPix("o",10); assert.equal(p.status,"PENDING"); assert(p.qrCodeDataUrl.startsWith("data:image/png;base64,"));
 assert.equal(confirmPayment(p.id)?.status,"PAID"); assert.equal(expirePayment(p.id),false);
 const p2=await createPix("o2",10); assert.equal(expirePayment(p2.id),true); assert.equal(p2.status,"EXPIRED");
});

test("order lifecycle assigns and completes",async()=>{
 process.env.FINANCIAL_API="http://127.0.0.1:9";
 for(const d of drivers.values()){d.status="AVAILABLE";d.location={lat:-24.112,lng:-49.334};d.activeSecondsToday=3600;d.sessionId="test-session"}
 const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"x",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:12.5});
 confirmPayment(payment.id); const assigned=await onPaymentConfirmed(payment.id);
 assert.equal(assigned.status,"ASSIGNED"); assert(assigned.assignedDriverId);
 assigned.confirmationCode="123456";assigned.status="AWAITING_CONFIRMATION";
 assert.equal(completeOrder(assigned.id,"123456"),true);
 assert.equal(order.status,"COMPLETED");
});

test("order completion rejects invalid confirmation code",async()=>{
 process.env.FINANCIAL_API="http://127.0.0.1:9";
 for(const d of drivers.values()){d.status="AVAILABLE";d.location={lat:-24.112,lng:-49.334};d.sessionId="test-session"}
 const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"x",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 confirmPayment(payment.id); const assigned=await onPaymentConfirmed(payment.id); assigned.confirmationCode="123456";assigned.status="AWAITING_CONFIRMATION";
 assert.equal(completeOrder(order.id,"000000"),false); assert.equal(order.status,"AWAITING_CONFIRMATION");
});
