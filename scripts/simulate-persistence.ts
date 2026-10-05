import {spawn,type ChildProcess} from "node:child_process";
import assert from "node:assert/strict";
import {existsSync,unlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import net from "node:net";

const dbFile=path.join(tmpdir(),`motoboys-delivery-${process.pid}.sqlite`);
for(const suffix of ["","-wal","-shm"])if(existsSync(dbFile+suffix))unlinkSync(dbFile+suffix);

const env={...process.env,MOTOBOYS_DB_FILE:dbFile,FINANCIAL_API:"http://127.0.0.1:9",PIX_EXPIRATION_SECONDS:"60"};

async function freePort(){
 return await new Promise<number>((resolve,reject)=>{
  const server=net.createServer();
  server.once("error",reject);
  server.listen(0,"127.0.0.1",()=>{
   const address=server.address();
   const port=typeof address==="object"&&address?address.port:undefined;
   server.close(error=>error?reject(error):port?resolve(port):reject(Error("Não foi possível alocar uma porta livre")));
  });
 });
}

async function runServer(action:(base:string)=>Promise<void>){
 const port=await freePort();
 const child=spawn(process.execPath,["--import","tsx","src/server.ts"],{
  env:{...env,PORT:String(port),PUBLIC_BASE_URL:`http://127.0.0.1:${port}`},
  stdio:["ignore","pipe","pipe"]
 });
 let stdout="";
 let stderr="";
 child.stdout?.on("data",data=>{stdout+=data.toString()});
 child.stderr?.on("data",data=>{stderr+=data.toString()});

 try{
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw Error(`Servidor terminou antes de ficar pronto (code ${child.exitCode}).\\n${stderr}\\n${stdout}`);
   try{
    const response=await fetch(base+"/api/state",{signal:AbortSignal.timeout(500)});
    if(response.ok){await action(base);return;}
   }catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error(`Timeout aguardando servidor em ${base}.\\nSTDERR:\\n${stderr}\\nSTDOUT:\\n${stdout}`);
 }finally{
  if(child.exitCode===null)child.kill("SIGTERM");
  await new Promise(resolve=>setTimeout(resolve,200));
  if(child.exitCode===null)child.kill("SIGKILL");
 }
}

let orderId="";
await runServer(async base=>{
 const response=await fetch(base+"/api/orders",{
  method:"POST",
  headers:{"content-type":"application/json"},
  body:JSON.stringify({
   companyId:"company-demo",
   customerPhone:"persist",
   pickup:{lat:-24.112,lng:-49.334},
   destination:{lat:-24.115,lng:-49.330},
   price:10
  })
 });
 assert.equal(response.status,201);
 const created=await response.json();
 orderId=created.order.id;
});

await runServer(async base=>{
 const state=await (await fetch(base+"/api/state")).json();
 const order=state.orders.find((x:{id:string})=>x.id===orderId);
 assert(order);
 assert.equal(order.status,"AWAITING_PAYMENT");
 assert(state.providers.some((x:{id:string})=>x.id==="company-demo"));
});

for(const suffix of ["","-wal","-shm"])if(existsSync(dbFile+suffix))unlinkSync(dbFile+suffix);
console.log(JSON.stringify({simulation:"persistence",orderId,preservedAcrossRestart:true,providerSeedPreserved:true},null,2));
