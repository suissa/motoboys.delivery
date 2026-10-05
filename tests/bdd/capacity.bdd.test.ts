import test from "node:test";
import assert from "node:assert/strict";
import {capacityReservations,drivers,orders,resetStore} from "../../src/store.js";
import {createOrder,onPaymentConfirmed} from "../../src/services/orders.js";
import {confirmPayment} from "../../src/services/payments.js";
import {capacityForCity} from "../../src/services/capacity.js";

test("Scenario: Given one eligible driver is available, When a paid order enters dispatch, Then one network capacity unit is committed",async()=>{
 resetStore();
 process.env.FINANCIAL_API="http://127.0.0.1:9";
 const d=drivers.get("moto-01")!;
 d.status="AVAILABLE";d.location={lat:-24.112,lng:-49.334};d.sessionId="bdd-capacity";d.activeSecondsToday=3600;
 const created=await createOrder({companyId:"company-demo",customerPhone:"capacity",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 confirmPayment(created.payment.id);
 const order=await onPaymentConfirmed(created.payment.id);
 assert.equal(order.capacityStatus,"PROMISED");
 assert.equal(capacityReservations.size,1);
 assert.equal(orders.get(order.id)?.capacityStatus,"PROMISED");
 const metrics=capacityForCity("Itararé");
 assert(metrics.committedReservations>=1);
});
