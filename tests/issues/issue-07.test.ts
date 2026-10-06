import test from "node:test";
import assert from "node:assert/strict";
import {drivers,orders,resetStore} from "../../src/store.js";
import {createOrder,onPaymentConfirmed} from "../../src/services/orders.js";
import {confirmPayment} from "../../src/services/payments.js";
import {acceptDispatch,rejectDispatch,transitionDelivery} from "../../src/services/dispatch.js";

test.beforeEach(()=>{resetStore();process.env.FINANCIAL_API="http://127.0.0.1:9"});

function ready(){for(const d of drivers.values()){d.status="AVAILABLE";d.location={lat:-24.112,lng:-49.334};d.sessionId="issue-07";d.activeSecondsToday=3600}}

test("dispatch follows offer, acceptance and delivery states",async()=>{
 ready();
 const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"issue-07",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 confirmPayment(payment.id);
 const offered=await onPaymentConfirmed(payment.id);
 const driver=offered.assignedDriverId!;
 assert.equal(offered.status,"OFFERED");
 acceptDispatch(order.id,driver);
 assert.equal(orders.get(order.id)?.status,"ASSIGNED");
 transitionDelivery(order.id,"PICKED_UP",driver);
 transitionDelivery(order.id,"IN_TRANSIT",driver);
 transitionDelivery(order.id,"ARRIVED",driver);
 assert.equal(orders.get(order.id)?.status,"ARRIVED");
});

test("rejection releases the driver and requeues the service",async()=>{
 ready();
 const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"issue-07b",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 confirmPayment(payment.id);
 const offered=await onPaymentConfirmed(payment.id);
 const first=offered.assignedDriverId!;
 rejectDispatch(order.id,first);
 assert.equal(drivers.get(first)?.status,"AVAILABLE");
 assert.notEqual(orders.get(order.id)?.assignedDriverId,first);
});
