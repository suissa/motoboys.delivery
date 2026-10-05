import crypto from "node:crypto";
import {getFinancialWebhookReceipt,ledgerTotals,readLedger,saveFinancialWebhookReceipt,saveLedgerEntry,transaction} from "../persistence/database.js";
import type {Payment} from "../domain.js";import {emitDomainEvent} from "../events.js";import {paymentView} from "../projections/operations.js";

const SECRET_ENV="FINANCIAL_WEBHOOK_SECRET";

export function paymentWebhookSignature(rawBody:string,secret=process.env[SECRET_ENV]??""){
 return "sha256="+crypto.createHmac("sha256",secret).update(rawBody).digest("hex");
}

export function verifyPaymentWebhookSignature(rawBody:string,signature:string|undefined,secret=process.env[SECRET_ENV]??""){
 if(!secret||!signature)return false;
 const expected=paymentWebhookSignature(rawBody,secret);
 const received=signature.startsWith("sha256=")?signature:"sha256="+signature;
 const a=Buffer.from(expected);
 const b=Buffer.from(received);
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

function cents(value:number){return Math.round(value*100)}

export function settlePayment(payment:Payment,idempotencyKey:string,payloadHash:string){
 return transaction(()=>{
  const existing=getFinancialWebhookReceipt(idempotencyKey);
  if(existing){
   if(existing.payload_hash!==payloadHash)throw Error("Idempotency key reutilizada com payload diferente");
   return{payment,alreadyProcessed:true,ledger:readLedger(payment.id)};
  }

  if(payment.status==="EXPIRED")throw Error("Cobrança expirada");
  const wasPending=payment.status==="PENDING";
  if(wasPending)payment.status="PAID";

  const now=new Date().toISOString();
  saveLedgerEntry({
   entry_id:crypto.randomUUID(),
   payment_id:payment.id,
   order_id:payment.orderId,
   entry_type:"PROVIDER_CREDIT",
   beneficiary_id:payment.providerId,
   amount_cents:cents(payment.providerPrice),
   currency:"BRL",
   idempotency_key:idempotencyKey,
   created_at:now
  });
  if(cents(payment.platformFee)>0)saveLedgerEntry({
   entry_id:crypto.randomUUID(),
   payment_id:payment.id,
   order_id:payment.orderId,
   entry_type:"PLATFORM_FEE",
   beneficiary_id:payment.platformFeeSourceId,
   amount_cents:cents(payment.platformFee),
   currency:"BRL",
   idempotency_key:idempotencyKey,
   created_at:now
  });

  const totals=ledgerTotals(payment.id);
  if(totals.providerCents+totals.platformFeeCents!==cents(payment.price)){
   throw Error("Ledger não reconcilia com o valor cobrado");
  }

  if(wasPending)emitDomainEvent({type:"PaymentConfirmed",aggregateType:"payment",aggregateId:payment.id,payload:{paymentId:payment.id,orderId:payment.orderId,customerTotal:payment.price,providerPrice:payment.providerPrice,platformFee:payment.platformFee},projections:[paymentView(payment)]});
  saveFinancialWebhookReceipt({
   idempotencyKey,
   payloadHash,
   paymentId:payment.id,
   processedAt:now
  });
  return{payment,alreadyProcessed:false,ledger:readLedger(payment.id)};
 });
}
