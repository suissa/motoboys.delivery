import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";

test("Scenario: Given the HTTP operation is running, When a customer pays and confirms, Then the delivery completes",async()=>{
 const port=60161;
 const child=spawn(process.execPath,["--import","tsx","src/server.ts"],{env:{...process.env,PORT:String(port),PUBLIC_BASE_URL:`http://127.0.0.1:${port}`,FINANCIAL_API:"http://127.0.0.1:9",PIX_EXPIRATION_SECONDS:"60"},stdio:"ignore"});
 try{
  let ready=false;
  for(let i=0;i<50&&!ready;i++){try{ready=(await fetch(`http://127.0.0.1:${port}/api/state`)).ok}catch{await new Promise(r=>setTimeout(r,100))}}
  assert(ready);
  await fetch(`http://127.0.0.1:${port}/api/drivers/moto-01/shift/start`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({seconds:60})});
  await fetch(`http://127.0.0.1:${port}/api/drivers/moto-01/location`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({lat:-24.112,lng:-49.334})});
  const created=await (await fetch(`http://127.0.0.1:${port}/api/orders`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId:"company-demo",customerPhone:"bdd",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10})})).json();
  assert.equal(created.order.status,"AWAITING_PAYMENT");
  await fetch(`http://127.0.0.1:${port}/api/payments/webhook`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({paymentId:created.payment.id})});
  let state=await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
  assert.equal(state.orders.find((x:any)=>x.id===created.order.id).status,"ASSIGNED");
  await fetch(`http://127.0.0.1:${port}/api/orders/${created.order.id}/confirm`,{method:"POST"});
  state=await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
  const code=state.orders.find((x:any)=>x.id===created.order.id).confirmationCode;
  await fetch(`http://127.0.0.1:${port}/api/whatsapp/webhook`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:{from:"5515999990001",text:code}})});
  state=await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
  assert.equal(state.orders.find((x:any)=>x.id===created.order.id).status,"COMPLETED");
 } finally { child.kill(); }
});
