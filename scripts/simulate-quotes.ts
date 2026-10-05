import assert from "node:assert/strict";
process.env.FINANCIAL_API="http://127.0.0.1:9";
const {createOrder}=await import("../src/services/orders.js");

const {order,payment}=await createOrder({
 companyId:"company-demo",
 customerPhone:"quote-simulation",
 pickup:{lat:-24.112,lng:-49.334},
 destination:{lat:-24.115,lng:-49.330},
 providerPrice:25,
 platformFee:3.5,
 platformFeeSourceId:"platform-v2"
});

assert.equal(order.providerPrice,25);
assert.equal(order.platformFee,3.5);
assert.equal(order.customerTotal,28.5);
assert.equal(payment.price,28.5);
assert.equal(order.quote.providerPriceSource.id,"company-demo");

console.log(JSON.stringify({simulation:"quotes",providerPrice:order.providerPrice,platformFee:order.platformFee,customerTotal:order.customerTotal,paymentAmount:payment.price},null,2));
