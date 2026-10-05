import assert from "node:assert/strict";
process.env.FINANCIAL_API="http://127.0.0.1:9";
const {drivers,orders,payments}=await import("../src/store.js");
const {createOrder,onPaymentConfirmed,completeOrder}=await import("../src/services/orders.js");
const {confirmPayment}=await import("../src/services/payments.js");
const {acceptDispatch,requestDeliveryConfirmation,transitionDelivery}=await import("../src/services/dispatch.js");

for(const d of drivers.values()){d.status="AVAILABLE";d.location={lat:-24.112,lng:-49.334};d.completedToday=0;d.activeSecondsToday=3600;d.lastAssignedAt=undefined;d.restUntil=undefined;d.sessionId="simulation";}

const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"5515999992000",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:12.5});
assert.equal(order.status,"AWAITING_PAYMENT");
confirmPayment(payment.id);

const offered=await onPaymentConfirmed(payment.id);
assert.equal(offered.status,"OFFERED");
assert(offered.assignedDriverId);

const driverId=offered.assignedDriverId!;
acceptDispatch(offered.id,driverId);
transitionDelivery(offered.id,"PICKED_UP",driverId);
transitionDelivery(offered.id,"IN_TRANSIT",driverId);
transitionDelivery(offered.id,"ARRIVED",driverId);
const awaiting=requestDeliveryConfirmation(offered.id);
assert.equal(awaiting.status,"AWAITING_CONFIRMATION");

const code=awaiting.confirmationCode!;
assert.match(code,/^\d{6}$/);
assert.equal(completeOrder(awaiting.id,code),true);
assert.equal(orders.get(order.id)?.status,"COMPLETED");
assert(payments.has(payment.id));

console.log(JSON.stringify({simulation:"orders",orderId:order.id,driverId,status:orders.get(order.id)?.status,stateMachine:["OFFERED","ASSIGNED","PICKED_UP","IN_TRANSIT","ARRIVED","AWAITING_CONFIRMATION","COMPLETED"]},null,2));
