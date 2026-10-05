import assert from "node:assert/strict";
process.env.FINANCIAL_API="http://127.0.0.1:9";
const {drivers,orders}=await import("../src/store.js");
const {createOrder,onPaymentConfirmed}=await import("../src/services/orders.js");
const {confirmPayment}=await import("../src/services/payments.js");
const {acceptDispatch,rejectDispatch,expireDispatchOffers,transitionDelivery}=await import("../src/services/dispatch.js");
for(const d of drivers.values()){d.status="AVAILABLE";d.location={lat:-24.112,lng:-49.334};d.activeSecondsToday=3600;d.sessionId="simulation";d.completedToday=0}
drivers.get("moto-01")!.completedToday=4;drivers.get("moto-02")!.completedToday=1;drivers.get("moto-03")!.completedToday=2;

const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"dispatch-sim",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
confirmPayment(payment.id);
const offer=await onPaymentConfirmed(payment.id);
assert.equal(offer.status,"OFFERED");
const first=offer.assignedDriverId!;
rejectDispatch(order.id,first);
assert.notEqual(orders.get(order.id)?.assignedDriverId,first);

const second=orders.get(order.id)!.assignedDriverId!;
acceptDispatch(order.id,second);
transitionDelivery(order.id,"PICKED_UP",second);
transitionDelivery(order.id,"IN_TRANSIT",second);
transitionDelivery(order.id,"ARRIVED",second);
assert.equal(orders.get(order.id)?.status,"ARRIVED");

orders.get(order.id)!.status="OFFERED";
orders.get(order.id)!.offerExpiresAt=new Date(Date.now()-1000).toISOString();
expireDispatchOffers();

console.log(JSON.stringify({simulation:"dispatch",reassigned:true,explicitAcceptance:true,arrivedBeforeConfirmation:true,finalStatus:orders.get(order.id)?.status},null,2));
