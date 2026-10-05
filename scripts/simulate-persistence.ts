import {spawn} from "node:child_process";
import assert from "node:assert/strict";
import {existsSync,unlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";

const dbFile=path.join(tmpdir(),`motoboys-delivery-${process.pid}.sqlite`);
for(const suffix of ["","-wal","-shm"])if(existsSync(dbFile+suffix))unlinkSync(dbFile+suffix);

const env={...process.env,MOTOBOYS_DB_FILE:dbFile,FINANCIAL_API:"http://127.0.0.1:9",PIX_EXPIRATION_SECONDS:"60"};

async function runServer(port:number,action:(base:string)=>Promise<void>){
 const child=spawn(process.execPath,["--import","tsx","src/server.ts"],{env:{...env,PORT:String(port),PUBLIC_BASE_URL:`http://127.0.0.1:${port}`},stdio:"ignore"});
 try{
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;i<50;i++){try{if((await fetch(base+"/api/state")).ok)break}catch{await new Promise(r=>setTimeout(r,100))}}
  assert((await fetch(base+"/api/state")).ok);
  await action(base);
 } finally {child.kill();await new Promise(r=>setTimeout(r,100));}
}

let orderId="";
await runServer(60162,async base=>{
 const created=await (await fetch(base+"/api/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId:"company-demo",customerPhone:"persist",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10})})).json();
 orderId=created.order.id;
});

await runServer(60163,async base=>{
 const state=await (await fetch(base+"/api/state")).json();
 const order=state.orders.find((x:{id:string})=>x.id===orderId);
 assert(order);
 assert.equal(order.status,"AWAITING_PAYMENT");
});

for(const suffix of ["","-wal","-shm"])if(existsSync(dbFile+suffix))unlinkSync(dbFile+suffix);
console.log(JSON.stringify({simulation:"persistence",orderId,preservedAcrossRestart:true},null,2));
