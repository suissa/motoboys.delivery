import test from "node:test";
import assert from "node:assert/strict";
import {drivers,orders,resetStore,twins} from "../src/store.js";
import {createOrder} from "../src/services/orders.js";
import {sendTwinMessage,observeInbound,twinContext} from "../src/services/twins.js";

test("Scenario: Given a canonical service, When customer and driver exchange mediated messages, Then two independent twins share one serviceId",async()=>{
 resetStore();process.env.FINANCIAL_API="http://127.0.0.1:9";
 const created=await createOrder({companyId:"company-demo",customerPhone:"bdd-twin-customer",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 const d=drivers.get("moto-01")!;orders.get(created.order.id)!.assignedDriverId=d.id;
 await sendTwinMessage(created.order.id,"CUSTOMER","Pedido recebido");
 await sendTwinMessage(created.order.id,"DRIVER","Oferta recebida");
 observeInbound(created.order.id,"CUSTOMER",created.order.customerPhone,created.order.customerPhone,{messageId:"bdd-customer",correlationId:"corr-customer"});
 observeInbound(created.order.id,"DRIVER",d.id,d.phone,{messageId:"bdd-driver",correlationId:"corr-driver"});
 const linked=[...twins.values()].filter(t=>t.serviceId===created.order.id);
 assert.equal(linked.length,2);
 assert.equal(linked.filter(t=>t.actorType==="CUSTOMER").length,1);
 assert.equal(linked.filter(t=>t.actorType==="DRIVER").length,1);
 assert.equal(twinContext(created.order.id)?.serviceId,created.order.id);
});