import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {paymentWebhookSignature} from "../../src/services/finance.js";

async function waitForServer(base:string){
 for(let i=0;i<60;i++){try{if((await fetch(base+"/api/state")).ok)return}catch{await new Promise(r=>setTimeout(r,100))}}
 throw Error("servidor não iniciou");
}

test("canonical HTTP + WhatsApp E2E preserves one service identity",async()=>{
 const port=60171;
 const secret="canonical-secret";
 const child=spawn(process.execPath,["--import","tsx","src/server.ts"],{
  env:{...process.env,PORT:String(port),PUBLIC_BASE_URL:`http://127.0.0.1:${port}`,MOTOBOYS_DB_FILE:":memory:",FINANCIAL_API:"http://127.0.0.1:9",FINANCIAL_WEBHOOK_SECRET:secret,WHATSAPP_MODE:"mock"},
  stdio:"ignore"
 });
 const base="http://127.0.0.1:"+port;
 try{
  await waitForServer(base);
  const create=await fetch(base+"/api/orders",{
   method:"POST",
   headers:{"content-type":"application/json","x-correlation-id":"canonical-http"},
   body:JSON.stringify({companyId:"company-demo",customerPhone:"canonical-e2e",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},providerPrice:20,platformFee:2})
  });
  assert.equal(create.status,201);
  const created=await create.json();

  await fetch(base+"/api/drivers/moto-01/shift/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({seconds:300})});
  await fetch(base+"/api/drivers/moto-01/location",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({lat:-24.112,lng:-49.334})});

  const body=JSON.stringify({paymentId:created.payment.id});
  const paid=await fetch(base+"/api/payments/webhook",{
   method:"POST",
   headers:{
    "content-type":"application/json",
    "x-financial-signature":paymentWebhookSignature(body,secret),
    "idempotency-key":"canonical-e2e-"+created.payment.id
   },
   body
  });
  assert.equal(paid.status,200);

  let state=await (await fetch(base+"/api/state")).json();
  let order=state.orders.find((x:any)=>x.id===created.order.id);
  assert.equal(order.status,"OFFERED");

  const driverId=order.assignedDriverId;
  assert.equal((await fetch(base+`/api/orders/${order.id}/dispatch/accept`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({driverId})})).status,200);
  for(const next of ["PICKED_UP","IN_TRANSIT","ARRIVED"]){
   const response=await fetch(base+`/api/orders/${order.id}/status`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status:next,driverId})});
   assert.equal(response.status,200);
  }

  assert.equal((await fetch(base+`/api/orders/${order.id}/confirm`,{method:"POST"})).status,200);
  state=await (await fetch(base+"/api/state")).json();
  order=state.orders.find((x:any)=>x.id===created.order.id);
  assert.equal(order.status,"AWAITING_CONFIRMATION");
  const code=order.confirmationCode;
  const inbound=await fetch(base+"/api/whatsapp/webhook",{
   method:"POST",
   headers:{"content-type":"application/json"},
   body:JSON.stringify({message:{id:"canonical-wamid-1",from:"5515999990001",text:code}})
  });
  assert.equal(inbound.status,200);

  state=await (await fetch(base+"/api/state")).json();
  order=state.orders.find((x:any)=>x.id===created.order.id);
  assert.equal(order.status,"COMPLETED");

  const twins=await (await fetch(base+`/api/services/${order.id}/twins`)).json();
  assert.equal(twins.context.serviceId,order.id);
  assert(twins.customerTwin);
  assert(twins.driverTwin);
  assert.equal("phone" in twins.customerTwin,false);

  const audit=await (await fetch(base+`/api/services/${order.id}/audit`)).json();
  assert(audit.timeline.length>0);
  assert(audit.timeline.every((x:any)=>x.correlationId==="canonical-http"||x.correlationId===undefined));
 }finally{child.kill();}
});
