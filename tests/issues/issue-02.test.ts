import test from "node:test";
import assert from "node:assert/strict";
import {drivers,orders,stateHistory,transaction,resetStore} from "../../src/store.js";

test.beforeEach(resetStore);

test("persistent order state is durable and leaves recoverable history",()=>{
  const id="issue-02-order";
  transaction(()=>{
    orders.set(id,{id,companyId:"company-demo",customerPhone:"test",pickup:{lat:1,lng:2},destination:{lat:3,lng:4},price:10,providerPrice:10,platformFee:2,customerTotal:12,quote:{providerPrice:10,platformFee:2,customerTotal:12,providerPriceSource:{type:"PROVIDER",id:"company-demo"},platformFeeSource:{type:"PLATFORM",id:"platform"},quotedAt:new Date().toISOString()},status:"AWAITING_PAYMENT",createdAt:new Date().toISOString()});
    orders.get(id)!.status="PAID";
  });
  assert.equal(orders.get(id)?.status,"PAID");
  assert(stateHistory("orders").some((x:any)=>x.entity_id===id && x.state_json?.includes('"status":"PAID"')));
});

test("failed transaction rolls back all mutations",()=>{
  assert.throws(()=>transaction(()=>{
    drivers.get("moto-01")!.status="BUSY";
    throw new Error("rollback");
  }));
  assert.equal(drivers.get("moto-01")?.status,"OFFLINE");
});
