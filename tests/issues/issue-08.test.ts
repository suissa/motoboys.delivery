import test from "node:test";
import assert from "node:assert/strict";
import {createOrder} from "../../src/services/orders.js";
import {resetStore} from "../../src/store.js";
import {settlePayment,paymentWebhookSignature} from "../../src/services/finance.js";
import {readLedger,ledgerTotals} from "../../src/persistence/database.js";

test.beforeEach(()=>{resetStore();process.env.FINANCIAL_WEBHOOK_SECRET="issue-08-secret";process.env.FINANCIAL_API="http://127.0.0.1:9"});

test("signed settlement is idempotent and reconciles provider plus platform fee",async()=>{
 const {payment}=await createOrder({companyId:"company-demo",customerPhone:"issue-08",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:20});
 const raw=JSON.stringify({paymentId:payment.id});
 const hash=paymentWebhookSignature(raw);
 const first=settlePayment(payment,"issue-08-key",await import("node:crypto").then(c=>c.createHash("sha256").update(raw).digest("hex")));
 assert.equal(first.alreadyProcessed,false);
 const second=settlePayment(payment,"issue-08-key",await import("node:crypto").then(c=>c.createHash("sha256").update(raw).digest("hex")));
 assert.equal(second.alreadyProcessed,true);
 assert.equal(readLedger(payment.id).length,2);
 const totals=ledgerTotals(payment.id);
 assert.equal(totals.providerCents+totals.platformFeeCents,Math.round(payment.price*100));
 assert(hash.startsWith("sha256="));
});
