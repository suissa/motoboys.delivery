import test from "node:test";
import assert from "node:assert/strict";
import {drivers,resetStore} from "../../src/store.js";
import {createOrder,onPaymentConfirmed} from "../../src/services/orders.js";
import {confirmPayment} from "../../src/services/payments.js";
import {readDomainEvents,readProjection} from "../../src/persistence/database.js";

test.beforeEach(resetStore);

test("business mutations produce events and rebuildable projections",async()=>{
  for(const d of drivers.values()){d.status="AVAILABLE";d.location={lat:-24.112,lng:-49.334};d.sessionId="issue-03";d.activeSecondsToday=3600}
  const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"issue-03",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
  confirmPayment(payment.id);
  const offered=await onPaymentConfirmed(payment.id);
  assert.equal(offered.status,"OFFERED");
  const events=readDomainEvents() as any[];
  assert(events.some(e=>e.event_type==="ServiceRequested"));
  assert(events.some(e=>e.event_type==="CandidateEvaluated"));
  const projected=(readProjection("operations","orders") as any[]).find(x=>x.state.id===order.id)?.state;
  assert.equal(projected.id,order.id);
});
