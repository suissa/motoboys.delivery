import test from "node:test";
import assert from "node:assert/strict";
import {drivers,orders,stateHistory,transaction} from "../../src/store.js";
import {resetState} from "../helpers/reset.js";

test.beforeEach(resetState);

test("SQLite state survives transactions and records recoverable history",()=>{
 const id="persistent-order";
 transaction(()=>{
   orders.set(id,{id,companyId:"company-demo",customerPhone:"x",pickup:{lat:1,lng:2},destination:{lat:3,lng:4},price:10,platformFee:2,status:"AWAITING_PAYMENT",createdAt:new Date().toISOString()});
   const order=orders.get(id)!;
   order.status="PAID";
 });
 assert.equal(orders.get(id)?.status,"PAID");
 const history=stateHistory("orders") as Array<{entity_id:string;operation:string;state_json:string|null}>;
 assert(history.some(x=>x.entity_id===id&&x.state_json?.includes('"status":"PAID"')));
});

test("failed transaction rolls back every mutation",()=>{
 const id="rollback-order";
 assert.throws(()=>transaction(()=>{
   orders.set(id,{id,companyId:"company-demo",customerPhone:"x",pickup:{lat:1,lng:2},destination:{lat:3,lng:4},price:10,platformFee:2,status:"AWAITING_PAYMENT",createdAt:new Date().toISOString()});
   throw Error("rollback");
 }));
 assert.equal(orders.get(id),undefined);
});

test("transactional driver state does not get duplicated by repeated assignment",()=>{
 const driver=drivers.get("moto-01")!;
 transaction(()=>{
   driver.status="BUSY";
   driver.status="BUSY";
 });
 assert.equal(drivers.get("moto-01")?.status,"BUSY");
});
