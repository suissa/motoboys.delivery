import test from "node:test";
import assert from "node:assert/strict";
import {capacityReservations,drivers,orders,resetStore} from "../../src/store.js";
import {createOrder,onPaymentConfirmed,completeOrder} from "../../src/services/orders.js";
import {confirmPayment} from "../../src/services/payments.js";
import {capacityForCity,reserveCapacityForOrder,releaseCapacityForOrder} from "../../src/services/capacity.js";
import {acceptDispatch,requestDeliveryConfirmation,transitionDelivery} from "../../src/services/dispatch.js";

test.beforeEach(()=>{resetStore();process.env.FINANCIAL_API="http://127.0.0.1:9"});

function availableDrivers(count=3){
 let i=0;
 for(const d of drivers.values()){
  d.status="AVAILABLE";
  d.location={lat:-24.112,lng:-49.334};
  d.sessionId="capacity-test";
  d.activeSecondsToday=3600;
  d.completedToday=++i;
  if(i>count)d.status="OFFLINE";
 }
}

test("one active reservation consumes one unit of network capacity",async()=>{
 availableDrivers(2);
 const first=await createOrder({companyId:"company-demo",customerPhone:"c1",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 const second=await createOrder({companyId:"company-demo",customerPhone:"c2",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 const a=reserveCapacityForOrder(first.order.id);
 const b=reserveCapacityForOrder(second.order.id);
 assert.equal(a.reserved,true);
 assert.equal(b.reserved,true);
 assert.equal(capacityReservations.size,2);
});

test("capacity becomes explicitly insufficient when no eligible driver exists",async()=>{
 availableDrivers(0);
 const created=await createOrder({companyId:"company-demo",customerPhone:"c",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 const result=reserveCapacityForOrder(created.order.id);
 assert.equal(result.reserved,false);
 assert.equal(orders.get(created.order.id)?.capacityStatus,"INSUFFICIENT");
});

test("reservation is released after successful delivery",async()=>{
 availableDrivers(3);
 const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"c",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 confirmPayment(payment.id);
 const offered=await onPaymentConfirmed(payment.id);
 const driverId=offered.assignedDriverId!;
 acceptDispatch(order.id,driverId);
 transitionDelivery(order.id,"PICKED_UP",driverId);
 transitionDelivery(order.id,"IN_TRANSIT",driverId);
 transitionDelivery(order.id,"ARRIVED",driverId);
 const awaiting=requestDeliveryConfirmation(order.id);
 assert.equal(completeOrder(order.id,awaiting.confirmationCode!),true);
 assert.equal(capacityReservations.get(order.capacityReservationId!)?.status,"RELEASED");
});
