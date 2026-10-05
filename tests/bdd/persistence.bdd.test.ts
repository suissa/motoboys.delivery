import test from "node:test";
import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {existsSync,unlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";

const dbFile=path.join(tmpdir(),`motoboys-delivery-bdd-${process.pid}.sqlite`);
for(const suffix of ["","-wal","-shm"])if(existsSync(dbFile+suffix))unlinkSync(dbFile+suffix);

function start(port:number):ChildProcess{
 return spawn(process.execPath,["--import","tsx","src/server.ts"],{
  env:{...process.env,PORT:String(port),PUBLIC_BASE_URL:`http://127.0.0.1:${port}`,MOTOBOYS_DB_FILE:dbFile,FINANCIAL_API:"http://127.0.0.1:9",PIX_EXPIRATION_SECONDS:"60"},
  stdio:"ignore"
 });
}
async function wait(base:string){
 for(let i=0;i<60;i++){try{if((await fetch(base+"/api/state")).ok)return}catch{await new Promise(r=>setTimeout(r,100))}}
 throw Error("Servidor não iniciou");
}

test("Scenario: Given two processes share the database, When payment is confirmed concurrently, Then dispatch is not duplicated",async()=>{
 const one=start(60164);const two=start(60165);
 try{
  const base1="http://127.0.0.1:60164",base2="http://127.0.0.1:60165";
  await wait(base1);await wait(base2);
  await fetch(base1+"/api/drivers/moto-01/shift/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({seconds:300})});
  await fetch(base1+"/api/drivers/moto-01/location",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({lat:-24.112,lng:-49.334})});
  const created=await (await fetch(base1+"/api/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId:"company-demo",customerPhone:"concurrent",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10})})).json();
  await Promise.all([
   fetch(base1+"/api/payments/webhook",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({paymentId:created.payment.id})}),
   fetch(base2+"/api/payments/webhook",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({paymentId:created.payment.id})})
  ]);
  const state=await (await fetch(base1+"/api/state")).json();
  const order=state.orders.find((x:{id:string})=>x.id===created.order.id);
  assert.equal(order.status,"ASSIGNED");
  assert.equal(order.assignedDriverId,"moto-01");
  assert.equal(state.drivers.find((x:{id:string})=>x.id==="moto-01").status,"BUSY");
 }finally{one.kill();two.kill();}
 for(const suffix of ["","-wal","-shm"])if(existsSync(dbFile+suffix))unlinkSync(dbFile+suffix);
});

test("Scenario: Given an awaiting confirmation, When two processes complete concurrently, Then completion occurs once",async()=>{
 const one=start(60166);const two=start(60167);
 try{
  const base1="http://127.0.0.1:60166",base2="http://127.0.0.1:60167";
  await wait(base1);await wait(base2);
  await fetch(base1+"/api/drivers/moto-01/shift/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({seconds:300})});
  await fetch(base1+"/api/drivers/moto-01/location",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({lat:-24.112,lng:-49.334})});
  const created=await (await fetch(base1+"/api/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId:"company-demo",customerPhone:"concurrent-complete",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10})})).json();
  await fetch(base1+"/api/payments/webhook",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({paymentId:created.payment.id})});
  await fetch(base1+`/api/orders/${created.order.id}/confirm`,{method:"POST"});
  const awaiting=await (await fetch(base1+"/api/state")).json();
  const code=awaiting.orders.find((x:{id:string})=>x.id===created.order.id).confirmationCode;
  await Promise.all([
   fetch(base1+"/api/whatsapp/webhook",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:{from:"5515999990001",text:code}})}),
   fetch(base2+"/api/whatsapp/webhook",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:{from:"5515999990001",text:code}})})
  ]);
  const state=await (await fetch(base2+"/api/state")).json();
  const order=state.orders.find((x:{id:string})=>x.id===created.order.id);
  const driver=state.drivers.find((x:{id:string})=>x.id==="moto-01");
  assert.equal(order.status,"COMPLETED");
  assert.equal(driver.deliveries,1);
 }finally{one.kill();two.kill();}
 for(const suffix of ["","-wal","-shm"])if(existsSync(dbFile+suffix))unlinkSync(dbFile+suffix);
});
