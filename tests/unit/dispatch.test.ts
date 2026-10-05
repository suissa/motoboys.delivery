import test from "node:test";
import assert from "node:assert/strict";
import {drivers,orders,resetStore} from "../../src/store.js";
import {createOrder,onPaymentConfirmed} from "../../src/services/orders.js";
import {confirmPayment} from "../../src/services/payments.js";
import {acceptDispatch,expireDispatchOffers,rejectDispatch,transitionDelivery} from "../../src/services/dispatch.js";

test.beforeEach(()=>{resetStore();process.env.FINANCIAL_API="http://127.0.0.1:9"});

function prepareDrivers(){
 for(const d of drivers.values()){
  d.status="AVAILABLE";
  d.location={lat:-24.112,lng:-49.334};
  d.activeSecondsToday=3600;
  d.sessionId="dispatch-test";
  d.completedToday=0;
 }
 drivers.get("moto-01")!.completedToday=4;
 drivers.get("moto-02")!.completedToday=1;
 drivers.get("moto-03")!.completedToday=2;
}

test("offer must be explicitly accepted before ASSIGNED",async()=>{
 prepareDrivers();
 const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"x",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 confirmPayment(payment.id);
 const offered=await onPaymentConfirmed(payment.id);
 assert.equal(offered.status,"OFFERED");
 assert.equal(drivers.get(offered.assignedDriverId!)?.status,"BUSY");
 acceptDispatch(order.id,offered.assignedDriverId!);
 assert.equal(orders.get(order.id)?.status,"ASSIGNED");
});

test("invalid state transition is rejected",async()=>{
 prepareDrivers();
 const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"x",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 confirmPayment(payment.id);
 const offered=await onPaymentConfirmed(payment.id);
 assert.throws(()=>transitionDelivery(order.id,"IN_TRANSIT",offered.assignedDriverId),/Transição inválida/);
});

test("reject releases driver and requeues to another eligible driver",async()=>{
 prepareDrivers();
 const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"x",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 confirmPayment(payment.id);
 const first=await onPaymentConfirmed(payment.id);
 const firstDriver=first.assignedDriverId!;
 rejectDispatch(order.id,firstDriver);
 const requeued=orders.get(order.id)!;
 assert.equal(requeued.status,"OFFERED");
 assert.notEqual(requeued.assignedDriverId,firstDriver);
 assert.equal(drivers.get(firstDriver)?.status,"AVAILABLE");
});

test("expired offer is requeued",async()=>{
 prepareDrivers();
 const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"x",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 confirmPayment(payment.id);
 const first=await onPaymentConfirmed(payment.id);
 first.offerExpiresAt=new Date(Date.now()-1000).toISOString();
 expireDispatchOffers();
 const current=orders.get(order.id)!;
 assert.notEqual(current.status,"ASSIGNED");
 assert.equal(current.status==="OFFERED"||current.status==="SEARCHING_DRIVER",true);
});
