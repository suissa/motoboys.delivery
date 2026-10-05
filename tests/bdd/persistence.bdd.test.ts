import test from "node:test";
import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {existsSync,unlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {paymentWebhookSignature} from "../../src/services/finance.js";

const dbFile=path.join(tmpdir(),`motoboys-delivery-bdd-${process.pid}.sqlite`);
const secret="dev-secret";
for(const suffix of ["","-wal","-shm"])if(existsSync(dbFile+suffix))unlinkSync(dbFile+suffix);

function start(port:number):ChildProcess{
 return spawn(process.execPath,["--import","tsx","src/server.ts"],{
  env:{...process.env,PORT:String(port),PUBLIC_BASE_URL:`http://127.0.0.1:${port}`,MOTOBOYS_DB_FILE:dbFile,FINANCIAL_API:"http://127.0.0.1:9",PIX_EXPIRATION_SECONDS:"60",FINANCIAL_WEBHOOK_SECRET:secret},
  stdio:"ignore"
 });
}
async function wait(base:string){for(let i=0;i<60;i++){try{if((await fetch(base+"/api/state")).ok)return}catch{await new Promise(r=>setTimeout(r,100))}}throw Error("Servidor não iniciou");}
function paymentRequest(base:string,paymentId:string,key:string){
 const body=JSON.stringify({paymentId});
 return fetch(base+"/api/payments/webhook",{method:"POST",headers:{"content-type":"application/json","x-financial-signature":paymentWebhookSignature(body,secret),"idempotency-key":key},body});
}

test("Scenario: Given two processes share the database, When payment is confirmed concurrently, Then dispatch is offered once",async()=>{
 const one=start(60164);const two=start(60165);
 try{
  const base1="http://127.0.0.1:60164",base2="http://127.0.0.1:60165";
  await wait(base1);await wait(base2);
  await fetch(base1+"/api/drivers/moto-01/shift/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({seconds:300})});
  await fetch(base1+"/api/drivers/moto-01/location",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({lat:-24.112,lng:-49.334})});
  const created=await (await fetch(base1+"/api/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId:"company-demo",customerPhone:"concurrent",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10})})).json();
  await Promise.all([
   paymentRequest(base1,created.payment.id,"concurrent-1"),
   paymentRequest(base2,created.payment.id,"concurrent-2")
  ]);
  const state=await (await fetch(base1+"/api/state")).json();
  const order=state.orders.find((x:{id:string})=>x.id===created.order.id);
  assert.equal(order.status,"OFFERED");
  assert.equal(order.assignedDriverId,"moto-01");
  assert.equal(state.drivers.find((x:{id:string})=>x.id==="moto-01").status,"BUSY");
 }finally{one.kill();two.kill();}
 for(const suffix of ["","-wal","-shm"])if(existsSync(dbFile+suffix))unlinkSync(dbFile+suffix);
});

test("Scenario: Given an arrived delivery, When two processes complete concurrently, Then completion occurs once",async()=>{
 const one=start(60166);const two=start(60167);
 try{
  const base1="http://127.0.0.1:60166",base2="http://127.0.0.1:60167";
  await wait(base1);await wait(base2);
  await fetch(base1+"/api/drivers/moto-01/shift/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({seconds:300})});
  await fetch(base1+"/api/drivers/moto-01/location",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({lat:-24.112,lng:-49.334})});
  const created=await (await fetch(base1+"/api/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId:"company-demo",customerPhone:"concurrent-complete",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10})})).json();
  await paymentRequest(base1,created.payment.id,"complete-flow");
  const offered=await (await fetch(base1+"/api/state")).then(r=>r.json());
  const order=offered.orders.find((x:{id:string})=>x.id===created.order.id);
  const driverId=order.assignedDriverId;
  await fetch(base1+`/api/orders/${created.order.id}/dispatch/accept`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({driverId})});
  for(const status of ["PICKED_UP","IN_TRANSIT","ARRIVED"]){
   await fetch(base1+`/api/orders/${created.order.id}/status`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status,driverId})});
  }
  await fetch(base1+`/api/orders/${created.order.id}/confirm`,{method:"POST"});
  const awaiting=await (await fetch(base1+"/api/state")).json();
  const code=awaiting.orders.find((x:{id:string})=>x.id===created.order.id).confirmationCode;
  await Promise.all([
   fetch(base1+"/api/whatsapp/webhook",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:{from:"5515999990001",text:code}})}),
   fetch(base2+"/api/whatsapp/webhook",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:{from:"5515999990001",text:code}})})
  ]);
  const state=await (await fetch(base2+"/api/state")).json();
  const finalOrder=state.orders.find((x:{id:string})=>x.id===created.order.id);
  const driver=state.drivers.find((x:{id:string})=>x.id==="moto-01");
  assert.equal(finalOrder.status,"COMPLETED");
  assert.equal(driver.deliveries,1);
 }finally{one.kill();two.kill();}
 for(const suffix of ["","-wal","-shm"])if(existsSync(dbFile+suffix))unlinkSync(dbFile+suffix);
});
