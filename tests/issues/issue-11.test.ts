import test from "node:test";
import assert from "node:assert/strict";
import {drivers,orders,resetStore,twins} from "../../src/store.js";
import {createOrder} from "../../src/services/orders.js";
import {observeInbound,sendTwinMessage,twinContext,closeServiceTwins} from "../../src/services/twins.js";

test.beforeEach(resetStore);

test("customer and driver twins are independent contexts for one service",async()=>{
 const {order}=await createOrder({companyId:"company-demo",customerPhone:"issue-11-customer",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 const d=drivers.get("moto-01")!;
 order.assignedDriverId=d.id; d.status="BUSY";
 await sendTwinMessage(order.id,"CUSTOMER","cliente");
 await sendTwinMessage(order.id,"DRIVER","motorista");
 observeInbound(order.id,"CUSTOMER",order.customerPhone,order.customerPhone,{messageId:"c",correlationId:"cc"});
 observeInbound(order.id,"DRIVER",d.id,d.phone,{messageId:"d",correlationId:"cd"});
 const customer=[...twins.values()].find(t=>t.serviceId===order.id&&t.actorType==="CUSTOMER");
 const driver=[...twins.values()].find(t=>t.serviceId===order.id&&t.actorType==="DRIVER");
 assert(customer&&driver);
 assert.notEqual(customer.id,driver.id);
 assert.equal(customer.serviceId,driver.serviceId);
 assert.equal(twinContext(order.id)?.serviceId,order.id);
 closeServiceTwins(order.id);
 assert([...twins.values()].filter(t=>t.serviceId===order.id).every(t=>t.state==="CLOSED"));
});
