import test from "node:test";
import assert from "node:assert/strict";
import {createOrder} from "../../src/services/orders.js";
import {resetStore} from "../../src/store.js";

test.beforeEach(resetStore);

test("provider price, platform fee and customer total remain separate and auditable",async()=>{
 const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"issue-12",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},providerPrice:25,platformFee:4,platformFeeSourceId:"platform-v2"});
 assert.equal(order.providerPrice,25);
 assert.equal(order.platformFee,4);
 assert.equal(order.customerTotal,29);
 assert.equal(payment.price,29);
 assert.equal(payment.providerPrice,25);
 assert.equal(payment.platformFee,4);
 assert.equal(order.quote.providerPriceSource.id,"company-demo");
 assert.equal(order.quote.platformFeeSource.id,"platform-v2");
});
