import test from "node:test";
import assert from "node:assert/strict";
import {createPix} from "../../src/services/payments.js";
import {settlePayment,paymentWebhookSignature,verifyPaymentWebhookSignature} from "../../src/services/finance.js";
import {ledgerTotals,readLedger} from "../../src/persistence/database.js";
import {resetStore} from "../helpers/reset.js";

test.beforeEach(()=>{resetStore();process.env.FINANCIAL_API="http://127.0.0.1:9"});

test("financial webhook signature is verified with timing-safe comparison",()=>{
 const body=JSON.stringify({paymentId:"p"});
 const signature=paymentWebhookSignature(body,"secret");
 assert.equal(verifyPaymentWebhookSignature(body,signature,"secret"),true);
 assert.equal(verifyPaymentWebhookSignature(body,signature,"wrong"),false);
 assert.equal(verifyPaymentWebhookSignature(body,signature.replace(/.$/,"0"),"secret"),false);
});

test("settlement is idempotent and ledger reconciles",async()=>{
 const p=await createPix("order-finance",28.5,{providerPrice:25,platformFee:3.5,providerId:"company-demo",platformFeeSourceId:"platform-v2"});
 const first=settlePayment(p,"idem-1","hash-1");
 const second=settlePayment(p,"idem-1","hash-1");
 assert.equal(first.alreadyProcessed,false);
 assert.equal(second.alreadyProcessed,true);
 const totals=ledgerTotals(p.id);
 assert.equal(totals.providerCents,2500);
 assert.equal(totals.platformFeeCents,350);
 assert.equal(totals.providerCents+totals.platformFeeCents,2850);
 assert.equal(readLedger(p.id).length,2);
});

test("reusing an idempotency key with a different payload is rejected",async()=>{
 const p=await createPix("order-finance-2",12,{providerPrice:10,platformFee:2,providerId:"company-demo",platformFeeSourceId:"platform-v2"});
 settlePayment(p,"idem-2","hash-a");
 assert.throws(()=>settlePayment(p,"idem-2","hash-b"),/payload diferente/);
});
