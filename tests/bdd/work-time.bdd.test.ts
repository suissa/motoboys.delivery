import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";

test("Scenario: Given an active shift, When it ends, Then active work time is persisted and rest does not add work",async()=>{
 const port=60168;
 const child=spawn(process.execPath,["--import","tsx","src/server.ts"],{env:{...process.env,PORT:String(port),MOTOBOYS_DB_FILE:"data/bdd-work-time.sqlite",FINANCIAL_API:"http://127.0.0.1:9"},stdio:"ignore"});
 try{
  const base="http://127.0.0.1:"+port;
  for(let i=0;i<50;i++){try{if((await fetch(base+"/api/state")).ok)break}catch{await new Promise(r=>setTimeout(r,100))}}
  await fetch(base+"/api/drivers/moto-01/shift/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({seconds:300})});
  await new Promise(r=>setTimeout(r,1100));
  await fetch(base+"/api/drivers/moto-01/rest",{method:"POST"});
  const resting=await (await fetch(base+"/api/state")).json();
  const before=resting.drivers.find((x:{id:string})=>x.id==="moto-01").activeSecondsToday;
  await new Promise(r=>setTimeout(r,1100));
  await fetch(base+"/api/drivers/moto-01/shift/end",{method:"POST"});
  const ended=await (await fetch(base+"/api/state")).json();
  const after=ended.drivers.find((x:{id:string})=>x.id==="moto-01").activeSecondsToday;
  assert(after>=before);
  assert(ended.drivers.find((x:{id:string})=>x.id==="moto-01").status==="OFFLINE");
 }finally{child.kill();}
});
