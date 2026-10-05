import assert from "node:assert/strict";
process.env.FINANCIAL_API="http://127.0.0.1:9";
const {drivers,orders}=await import("../src/store.js");
const {createOrder,onPaymentConfirmed}=await import("../src/services/orders.js");
const {confirmPayment}=await import("../src/services/payments.js");
const {capacityForCity}=await import("../src/services/capacity.js");

for(const d of drivers.values()){
 d.status="AVAILABLE";
 d.location={lat:-24.112,lng:-49.334};
 d.sessionId="capacity-sim";
 d.activeSecondsToday=3600;
}
const before=capacityForCity("Itararé");
assert(before.eligibleDrivers>0);

const first=await createOrder({companyId:"company-demo",customerPhone:"capacity-sim-1",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
confirmPayment(first.payment.id);
const firstOrder=await onPaymentConfirmed(first.payment.id);
assert.equal(firstOrder.capacityStatus,"PROMISED");

const after=capacityForCity("Itararé");
assert(after.committedReservations>=1);
assert(after.availableCapacity<before.availableCapacity);

const second=await createOrder({companyId:"company-demo",customerPhone:"capacity-sim-2",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
console.log(JSON.stringify({simulation:"capacity",eligibleDrivers:after.eligibleDrivers,committedReservations:after.committedReservations,availableCapacity:after.availableCapacity,secondOrder:orders.get(second.order.id)?.capacityStatus??"UNPAID"},null,2));
