import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {existsSync,unlinkSync} from "node:fs";

test("Scenario: Given a driver shares location, When the location session expires, Then the location disappears from the operational projection",async()=>{
 const port=60169;
 const db="data/bdd-location.sqlite";
 for(const suffix of ["","-wal","-shm"])if(existsSync(db+suffix))unlinkSync(db+suffix);
 const child=spawn(process.execPath,["--import","tsx","src/server.ts"],{env:{...process.env,PORT:String(port),MOTOBOYS_DB_FILE:db,LOCATION_NETWORK_TTL_SECONDS:"1"},stdio:"ignore"});
 try{
  const base="http://127.0.0.1:"+port;
  let ready=false;
  for(let i=0;i<50&&!ready;i++){try{ready=(await fetch(base+"/api/state")).ok}catch{await new Promise(r=>setTimeout(r,100))}}
  assert(ready);
  await fetch(base+"/api/drivers/moto-01/shift/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({seconds:60})});
  await fetch(base+"/api/drivers/moto-01/location",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({lat:-24.112,lng:-49.334})});
  let state=await (await fetch(base+"/api/state")).json();
  assert.equal(state.drivers.find((d:any)=>d.id==="moto-01").location.lat,-24.112);
  await new Promise(r=>setTimeout(r,1200));
  state=await (await fetch(base+"/api/state")).json();
  assert.equal(state.drivers.find((d:any)=>d.id==="moto-01").location,undefined);
 }finally{child.kill();for(const suffix of ["","-wal","-shm"])if(existsSync(db+suffix))unlinkSync(db+suffix);}
});
