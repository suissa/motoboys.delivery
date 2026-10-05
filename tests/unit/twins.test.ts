import test from "node:test";
import assert from "node:assert/strict";
import {drivers,orders,resetStore,twins} from "../../src/store.js";
import {createOrder} from "../../src/services/orders.js";
import {ensureTwin,observeInbound,sendTwinMessage,twinContext,closeServiceTwins} from "../../src/services/twins.js";

test.beforeEach(()=>{resetStore();process.env.FINANCIAL_API="http://127.0.0.1:9"});

test("customer and driver have independent twins linked by the same service",async()=>{
 const created=await createOrder({companyId:"company-demo",customerPhone:"customer-phone",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 const d=drivers.get("moto-01")!;
 d.status="BUSY";
 d.providerId="company-demo";
 orders.get(created.order.id)!.assignedDriverId=d.id;
 orders.get(created.order.id)!.assignedProviderId=d.providerId;
 await sendTwinMessage(created.order.id,"DRIVER","Oferta de teste");
 await sendTwinMessage(created.order.id,"CUSTOMER","Pedido recebido");
 observeInbound(created.order.id,"DRIVER",d.id,d.phone,{messageId:"wamid-driver",correlationId:"corr-driver"});
 observeInbound(created.order.id,"CUSTOMER",created.order.customerPhone,created.order.customerPhone,{messageId:"wamid-customer",correlationId:"corr-customer"});
 const customer=twins.get(created.order.id+":CUSTOMER:"+created.order.customerPhone);
 const driver=twins.get(created.order.id+":DRIVER:"+d.id);
 assert(customer);assert(driver);
 assert.equal(customer?.serviceId,created.order.id);
 assert.equal(driver?.serviceId,created.order.id);
 assert.notEqual(customer?.id,driver?.id);
 assert.equal(twinContext(created.order.id)?.serviceId,created.order.id);
});

test("closing a service closes both conversational twins without deleting their audit context",async()=>{
 const created=await createOrder({companyId:"company-demo",customerPhone:"customer-close",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 const d=drivers.get("moto-01")!;
 await sendTwinMessage(created.order.id,"CUSTOMER","teste");
 orders.get(created.order.id)!.assignedDriverId=d.id;
 await sendTwinMessage(created.order.id,"DRIVER","teste");
 closeServiceTwins(created.order.id);
 const serviceTwins=[...twins.values()].filter(t=>t.serviceId===created.order.id);
 assert(serviceTwins.length>=2);
 assert(serviceTwins.every(t=>t.state==="CLOSED"));
});