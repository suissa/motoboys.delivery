import assert from "node:assert/strict";
process.env.FINANCIAL_API="http://127.0.0.1:9";
const {drivers,orders,providers}=await import("../src/store.js");
const {rankCandidates}=await import("../src/services/queue.js");
const {createOrder,onPaymentConfirmed}=await import("../src/services/orders.js");
const {confirmPayment}=await import("../src/services/payments.js");
const {acceptDispatch}=await import("../src/services/dispatch.js");

for(const d of drivers.values()){
 d.status="AVAILABLE";
 d.location={lat:-24.112,lng:-49.334};
 d.sessionId="provider-sim";
 d.activeSecondsToday=3600;
 d.completedToday=0;
}
const candidates=rankCandidates({lat:-24.112,lng:-49.334});
assert(new Set(candidates.map(x=>x.providerId)).size>=2);

const {order,payment}=await createOrder({
 companyId:"company-demo",
 customerPhone:"provider-sim",
 pickup:{lat:-24.112,lng:-49.334},
 destination:{lat:-24.115,lng:-49.330},
 price:10
});
confirmPayment(payment.id);
const offered=await onPaymentConfirmed(payment.id);
acceptDispatch(order.id,offered.assignedDriverId!);
const assigned=orders.get(order.id)!;
assert(assigned.assignedProviderId);

console.log(JSON.stringify({
 simulation:"providers",
 providers: [...providers.values()].map(p=>({id:p.id,type:p.type,city:p.city,enabled:p.enabled})),
 eligibleDrivers:candidates.map(x=>({driverId:x.driver.id,providerId:x.providerId,providerType:x.providerType})),
 assignedProviderId:assigned.assignedProviderId
},null,2));
