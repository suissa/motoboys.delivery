import test from "node:test";
import assert from "node:assert/strict";
import {drivers,locationSessions,orders,resetStore,twins} from "../../src/store.js";
import {createOrder,onPaymentConfirmed,completeOrder} from "../../src/services/orders.js";
import {confirmPayment} from "../../src/services/payments.js";
import {acceptDispatch,requestDeliveryConfirmation,transitionDelivery} from "../../src/services/dispatch.js";
import {shareDriverLocation} from "../../src/services/location.js";
import {assertCanonicalScenario,DELIVERY_SCENARIO} from "../../src/qa/canonical.js";
import {serviceAuditTimeline,runWithObservabilityContext} from "../../src/observability.js";
import {ledgerTotals} from "../../src/persistence/database.js";
import {sendTwinMessage,twinContext} from "../../src/services/twins.js";
import {rankCandidates} from "../../src/services/queue.js";

test.beforeEach(()=>{resetStore();process.env.FINANCIAL_API="http://127.0.0.1:9"});

test("canonical contract defines intent, actions, agents, flow, channels, twins and provider types",()=>{
 assert.equal(assertCanonicalScenario(DELIVERY_SCENARIO),true);
});

test("canonical trajectory completes through the only valid flow",async()=>{
 const result=await runWithObservabilityContext({correlationId:"canonical-correlation"},async()=>{
  for(const d of drivers.values()){
   d.status="AVAILABLE";
   d.location={lat:-24.112,lng:-49.334};
   d.sessionId="canonical-shift";
   d.activeSecondsToday=3600;
   d.completedToday=0;
  }
  const candidates=rankCandidates({lat:-24.112,lng:-49.334});
  assert(candidates.some(x=>x.providerType==="COMPANY"));
  assert(candidates.some(x=>x.providerType==="INDEPENDENT"));

  const created=await createOrder({
   companyId:"company-demo",
   customerPhone:"canonical-customer",
   pickup:{lat:-24.112,lng:-49.334},
   destination:{lat:-24.115,lng:-49.330},
   providerPrice:25,
   platformFee:3.5
  });
  assert.equal(created.order.customerTotal,28.5);
  confirmPayment(created.payment.id);
  const offered=await onPaymentConfirmed(created.payment.id);
  assert.equal(offered.status,"OFFERED");
  assert.equal(offered.capacityStatus,"PROMISED");
  assert(offered.assignedDriverId);
  assert(offered.assignedProviderId);

  acceptDispatch(offered.id,offered.assignedDriverId!);
  transitionDelivery(offered.id,"PICKED_UP",offered.assignedDriverId!);
  transitionDelivery(offered.id,"IN_TRANSIT",offered.assignedDriverId!);
  transitionDelivery(offered.id,"ARRIVED",offered.assignedDriverId!);
  const awaiting=requestDeliveryConfirmation(offered.id);
  assert.equal(awaiting.status,"AWAITING_CONFIRMATION");
  assert.match(awaiting.confirmationCode!,/^\d{6}$/);

  assert.equal(ledgerTotals(created.payment.id).providerCents+ledgerTotals(created.payment.id).platformFeeCents,2850);
  await sendTwinMessage(created.order.id,"CUSTOMER","Código de teste");
  await sendTwinMessage(created.order.id,"DRIVER","Entrega no destino");

  assert.equal(completeOrder(created.order.id,awaiting.confirmationCode!),true);
  const final=orders.get(created.order.id)!;
  assert.equal(final.status,"COMPLETED");
  assert.equal(final.providerPrice,25);
  assert.equal(final.platformFee,3.5);
  assert.equal(final.customerTotal,28.5);
  assert.equal(locationSessions.size,0);
  assert.equal(twinContext(created.order.id)?.serviceId,created.order.id);
  assert([...twins.values()].filter(t=>t.serviceId===created.order.id).every(t=>t.state==="CLOSED"));
  assert(serviceAuditTimeline(created.order.id).some(x=>x.correlationId==="canonical-correlation"));
  return final;
 });
 assert.equal(result.status,"COMPLETED");
});
