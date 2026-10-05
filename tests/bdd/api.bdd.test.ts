import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {paymentWebhookSignature} from "../../src/services/finance.js";

test("Scenario: Given the HTTP operation is running, When a customer pays and confirms, Then the delivery completes once",async()=>{
 const port=60161;const secret="dev-secret";
 const child=spawn(process.execPath,["--import","tsx","src/server.ts"],{env:{...process.env,PORT:String(port),PUBLIC_BASE_URL:`http://127.0.0.1:${port}`,FINANCIAL_API:"http://127.0.0.1:9",PIX_EXPIRATION_SECONDS:"60",FINANCIAL_WEBHOOK_SECRET:secret},stdio:"ignore"});
 try{
  let ready=false;
  for(let i=0;i<50&&!ready;i++){try{ready=(await fetch(`http://127.0.0.1:${port}/api/state`)).ok}catch{await new Promise(r=>setTimeout(r,100))}}
  assert(ready);
  await fetch(`http://127.0.0.1:${port}/api/drivers/moto-01/shift/start`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({seconds:60})});
  await fetch(`http://127.0.0.1:${port}/api/drivers/moto-01/location`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({lat:-24.112,lng:-49.334})});
  const created=await (await fetch(`http://127.0.0.1:${port}/api/orders`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId:"company-demo",customerPhone:"bdd",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10})})).json();
  assert.equal(created.order.status,"AWAITING_PAYMENT");
  const paymentBody=JSON.stringify({paymentId:created.payment.id});
  const headers={"content-type":"application/json","x-financial-signature":paymentWebhookSignature(paymentBody,secret),"idempotency-key":"bdd-"+created.payment.id};
  const paid=await fetch(`http://127.0.0.1:${port}/api/payments/webhook`,{method:"POST",headers,body:paymentBody});
  assert.equal(paid.status,200);
  const repeated=await fetch(`http://127.0.0.1:${port}/api/payments/webhook`,{method:"POST",headers,body:paymentBody});
  assert.equal(repeated.status,200);
  const repeatedBody=await repeated.json();
  assert.equal(repeatedBody.alreadyProcessed,true);
  let state=await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
  const offered=state.orders.find((x:any)=>x.id===created.order.id);assert.equal(offered.status,"OFFERED");
  const driverId=offered.assignedDriverId;
  const accepted=await fetch(`http://127.0.0.1:${port}/api/orders/${created.order.id}/dispatch/accept`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({driverId})});
  assert.equal(accepted.status,200);
  for(const status of ["PICKED_UP","IN_TRANSIT","ARRIVED"]){const step=await fetch(`http://127.0.0.1:${port}/api/orders/${created.order.id}/status`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status,driverId})});assert.equal(step.status,200)}
  await fetch(`http://127.0.0.1:${port}/api/orders/${created.order.id}/confirm`,{method:"POST"});
  state=await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
  const code=state.orders.find((x:any)=>x.id===created.order.id).confirmationCode;
  await fetch(`http://127.0.0.1:${port}/api/whatsapp/webhook`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:{from:"5515999990001",text:code}})});
  state=await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
  assert.equal(state.orders.find((x:any)=>x.id===created.order.id).status,"COMPLETED");
 }finally{child.kill();}
});
