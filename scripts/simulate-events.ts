import assert from "node:assert/strict";
import {drivers,resetStore} from "../src/store.js";
import {readDomainEvents,readProjection} from "../src/persistence/database.js";
import {createOrder,onPaymentConfirmed,completeOrder} from "../src/services/orders.js";
import {confirmPayment} from "../src/services/payments.js";
import {rebuildOperationalProjections} from "../src/events.js";

process.env.FINANCIAL_API="http://127.0.0.1:9";
resetStore();

for(const d of drivers.values()){
 d.status="AVAILABLE";
 d.location={lat:-24.112,lng:-49.334};
 d.activeSecondsToday=3600;
}

const {order,payment}=await createOrder({
 companyId:"company-demo",
 customerPhone:"events",
 pickup:{lat:-24.112,lng:-49.334},
 destination:{lat:-24.115,lng:-49.330},
 price:12.5
});

confirmPayment(payment.id);
const assigned=await onPaymentConfirmed(payment.id);
assert.equal(assigned.status,"ASSIGNED");

assigned.confirmationCode="123456";
assigned.status="AWAITING_CONFIRMATION";
assert.equal(completeOrder(order.id,"123456"),true);

const events=readDomainEvents();
const projection=readProjection("operations","orders").find((x:any)=>x.state.id===order.id);
assert.equal(projection?.state.status,"COMPLETED");
rebuildOperationalProjections();
const rebuilt=readProjection("operations","orders").find((x:any)=>x.state.id===order.id);
assert.equal(rebuilt?.state.status,"COMPLETED");
assert(events.some((x:any)=>x.event_type==="ServiceRequested"));
assert(events.some((x:any)=>x.event_type==="DispatchAccepted"));
assert(events.some((x:any)=>x.event_type==="DeliveryConfirmed"));

console.log(JSON.stringify({simulation:"events",orderId:order.id,eventCount:events.length,rebuildVerified:true},null,2));
