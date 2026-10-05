import test from "node:test";
import assert from "node:assert/strict";
import {drivers,orders,resetStore} from "../../src/store.js";
import {createOrder,onPaymentConfirmed} from "../../src/services/orders.js";
import {confirmPayment} from "../../src/services/payments.js";
import {acceptDispatch,rejectDispatch,requestDeliveryConfirmation,transitionDelivery} from "../../src/services/dispatch.js";

test.beforeEach(()=>{resetStore();process.env.FINANCIAL_API="http://127.0.0.1:9"});

test("Scenario: Given a paid order, When the driver accepts the offer and progresses the delivery, Then every state transition is explicit",async()=>{
 resetStore();
 for(const d of drivers.values()){d.status="AVAILABLE";d.location={lat:-24.112,lng:-49.334};d.activeSecondsToday=3600;d.sessionId="bdd-dispatch"}
 const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"dispatch-bdd",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 confirmPayment(payment.id);
 let current=await onPaymentConfirmed(payment.id);
 assert.equal(current.status,"OFFERED");
 const driverId=current.assignedDriverId!;
 rejectDispatch(order.id,driverId);
 current=(await onPaymentConfirmed(payment.id));
 assert.equal(current.status,"OFFERED");
 const reassigned=current.assignedDriverId!;
 acceptDispatch(order.id,reassigned);
 assert.equal(ordersStatus(order.id),"ASSIGNED");
 transitionDelivery(order.id,"PICKED_UP",reassigned);
 transitionDelivery(order.id,"IN_TRANSIT",reassigned);
 transitionDelivery(order.id,"ARRIVED",reassigned);
 const awaiting=requestDeliveryConfirmation(order.id);
 assert.equal(awaiting.status,"AWAITING_CONFIRMATION");
});
