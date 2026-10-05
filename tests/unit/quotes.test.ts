import test from "node:test";
import assert from "node:assert/strict";
import {drivers,orders,resetStore} from "../../src/store.js";
import {createOrder} from "../../src/services/orders.js";
import {readProjection} from "../../src/persistence/database.js";

test.beforeEach(()=>{resetStore();process.env.FINANCIAL_API="http://127.0.0.1:9"});

test("quote separates provider price, platform fee and customer total",async()=>{
 const result=await createOrder({
  companyId:"company-demo",
  customerPhone:"quote",
  pickup:{lat:-24.112,lng:-49.334},
  destination:{lat:-24.115,lng:-49.330},
  providerPrice:25,
  platformFee:3.5,
  platformFeeSourceId:"platform-v2"
 });
 assert.equal(result.order.providerPrice,25);
 assert.equal(result.order.platformFee,3.5);
 assert.equal(result.order.customerTotal,28.5);
 assert.equal(result.order.price,25);
 assert.equal(result.payment.price,28.5);
 assert.equal(result.order.quote.providerPriceSource.type,"PROVIDER");
 assert.equal(result.order.quote.providerPriceSource.id,"company-demo");
 assert.equal(result.order.quote.platformFeeSource.id,"platform-v2");
 assert.equal(result.order.quote.customerTotal,28.5);
});

test("legacy price input remains an alias for provider price",async()=>{
 const {order,payment}=await createOrder({
  companyId:"company-demo",
  customerPhone:"legacy",
  pickup:{lat:-24.112,lng:-49.334},
  destination:{lat:-24.115,lng:-49.330},
  price:10
 });
 assert.equal(order.providerPrice,10);
 assert.equal(order.platformFee,2);
 assert.equal(order.customerTotal,12);
 assert.equal(payment.price,12);
});

test("operational projection keeps quote origins auditable",async()=>{
 const {order}=await createOrder({
  companyId:"company-demo",
  customerPhone:"projection",
  pickup:{lat:-24.112,lng:-49.334},
  destination:{lat:-24.115,lng:-49.330},
  providerPrice:30,
  platformFee:4
 });
 const projected=(readProjection("operations","orders") as Array<{state:any}>).find(x=>x.state.id===order.id)?.state;
 assert.equal(projected.quote.providerPriceSource.id,"company-demo");
 assert.equal(projected.quote.platformFeeSource.type,"PLATFORM");
 assert.equal(projected.customerTotal,34);
 assert.equal(drivers.get("moto-01")?.earnedToday,0);
 assert(orders.has(order.id));
});
