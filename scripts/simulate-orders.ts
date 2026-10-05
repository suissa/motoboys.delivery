import assert from "node:assert/strict";
process.env.FINANCIAL_API="http://127.0.0.1:9";
const {drivers,orders,payments}=await import("../src/store.js");
const {createOrder,onPaymentConfirmed,completeOrder}=await import("../src/services/orders.js");
const {confirmPayment}=await import("../src/services/payments.js");
for (const d of drivers.values()) { d.status="AVAILABLE"; d.location={lat:-24.112,lng:-49.334}; d.completedToday=0; d.activeSecondsToday=3600; d.lastAssignedAt=undefined; d.restUntil=undefined; }
const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"5515999992000",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:12.5});
assert.equal(order.status,"AWAITING_PAYMENT");
confirmPayment(payment.id);
const assigned=await onPaymentConfirmed(payment.id);
assert.equal(assigned.status,"ASSIGNED");
await (async()=>{})();
const code="123456"; assigned.confirmationCode=code; assigned.status="AWAITING_CONFIRMATION";
assert.equal(completeOrder(assigned.id,code),true);
assert.equal(orders.get(order.id)?.status,"COMPLETED");
assert(payments.has(payment.id));
console.log(JSON.stringify({simulation:"orders",orderId:order.id,driverId:assigned.assignedDriverId,status:assigned.status},null,2));
