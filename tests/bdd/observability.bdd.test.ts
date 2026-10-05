import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";

test("Scenario: Given an HTTP request with X-Correlation-Id, When the service is queried, Then the same correlation id is returned",async()=>{
 const port=60170;
 const child=spawn(process.execPath,["--import","tsx","src/server.ts"],{env:{...process.env,PORT:String(port),MOTOBOYS_DB_FILE:":memory:",FINANCIAL_WEBHOOK_SECRET:"dev-secret"},stdio:"ignore"});
 try{
  const base="http://127.0.0.1:"+port;
  let ready=false;
  for(let i=0;i<50&&!ready;i++){try{ready=(await fetch(base+"/api/state")).ok}catch{await new Promise(r=>setTimeout(r,100))}}
  assert(ready);
  const response=await fetch(base+"/api/state",{headers:{"x-correlation-id":"bdd-correlation"}});
  assert.equal(response.headers.get("x-correlation-id"),"bdd-correlation");
 }finally{child.kill();}
});
