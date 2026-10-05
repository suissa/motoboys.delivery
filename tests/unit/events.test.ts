import test from "node:test";
import assert from "node:assert/strict";
import {drivers,resetStore} from "../../src/store.js";
import {readDomainEvents,readProjection} from "../../src/persistence/database.js";
import {createOrder,onPaymentConfirmed,completeOrder} from "../../src/services/orders.js";
import {confirmPayment} from "../../src/services/payments.js";
import {acceptDispatch,requestDeliveryConfirmation,transitionDelivery} from "../../src/services/dispatch.js";

test.beforeEach(()=>{resetStore();process.env.FINANCIAL_API="http://127.0.0.1:9"});

test("operational mutations emit domain events and update the projection",async()=>{
 for(const d of drivers.values()){d.status="AVAILABLE";d.location={lat:-24.112,lng:-49.334};d.activeSecondsToday=3600;d.sessionId="test-session"}
 const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"events",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 confirmPayment(payment.id);
 const offered=await onPaymentConfirmed(payment.id);
 acceptDispatch(offered.id,offered.assignedDriverId!);
 transitionDelivery(offered.id,"PICKED_UP",offered.assignedDriverId);
 transitionDelivery(offered.id,"IN_TRANSIT",offered.assignedDriverId);
 transitionDelivery(offered.id,"ARRIVED",offered.assignedDriverId);
 const awaiting=requestDeliveryConfirmation(order.id);
 assert.equal(awaiting.status,"AWAITING_CONFIRMATION");
 awaiting.confirmationCode="123456";
 assert.equal(completeOrder(order.id,"123456"),true);
 const types=(readDomainEvents() as Array<{event_type:string}>).map(e=>e.event_type);
 for(const expected of ["ServiceRequested","PaymentRequested","PaymentLinked","PaymentConfirmed","CandidateEvaluated","DispatchOffered","DispatchAccepted","PickupConfirmed","TransitStarted","DriverArrived","ConfirmationRequested","DeliveryConfirmed"])assert(types.includes(expected),expected);
 const projection=(readProjection("operations","orders") as Array<{state:any}>).find(x=>x.state.id===order.id)?.state;
 assert.equal(projection.status,"COMPLETED");
});

test("operational projections can be rebuilt entirely from the event log",async()=>{
 for(const d of drivers.values()){d.status="AVAILABLE";d.location={lat:-24.112,lng:-49.334};d.activeSecondsToday=3600;d.sessionId="test-session"}
 const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"rebuild",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:11});
 confirmPayment(payment.id);
 const offered=await onPaymentConfirmed(payment.id);
 acceptDispatch(offered.id,offered.assignedDriverId!);
 const before=(readProjection("operations","orders") as Array<{state:any}>).find(x=>x.state.id===order.id)?.state;
 assert.equal(before.status,"ASSIGNED");
 const {rebuildOperationalProjections}=await import("../../src/events.js");
 rebuildOperationalProjections();
 const after=(readProjection("operations","orders") as Array<{state:any}>).find(x=>x.state.id===order.id)?.state;
 assert.deepEqual(after,before);
});
