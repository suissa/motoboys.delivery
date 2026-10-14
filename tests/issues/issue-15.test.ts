import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import fs from "node:fs";

test("canonical QA entrypoints exist in the package contract",()=>{
 const pkg=JSON.parse(fs.readFileSync(new URL("../../package.json",import.meta.url),"utf8"));
 assert.equal(typeof pkg.scripts.build,"string");
 assert.equal(typeof pkg.scripts.test,"string");
 assert.equal(typeof pkg.scripts["test:unit"],"string");
 assert.equal(typeof pkg.scripts["test:bdd"],"string");
 assert.equal(typeof pkg.scripts["simulate:pipeline"],"string");
});

test("HTTP and WhatsApp E2E can be exercised without a browser",async()=>{
 const child=spawn(process.execPath,["--import","tsx","src/server.ts"],{env:{...process.env,PORT:"60161",MOTOBOYS_DB_FILE:"/tmp/motoboys-issue-15.sqlite",WHATSAPP_MODE:"mock"},stdio:["ignore","pipe","pipe"]});
 let output="";
 child.stdout.on("data",d=>output+=d.toString());
 child.stderr.on("data",d=>output+=d.toString());
 try{
  let ready=false;
  for(let i=0;i<50;i++){
   try{const r=await fetch("http://127.0.0.1:60161/api/distance?lat1=-24.1&lng1=-49.3&lat2=-24.11&lng2=-49.31");if(r.ok){ready=true;break}}catch{}
   await new Promise(r=>setTimeout(r,100));
   if(child.exitCode!==null)throw new Error("server exited early: "+output);
  }
  assert.equal(ready,true,"server did not start: "+output);
  const distance=await fetch("http://127.0.0.1:60161/api/distance?lat1=-24.1&lng1=-49.3&lat2=-24.11&lng2=-49.31");
  assert.equal(distance.status,200);
  const whatsapp=await fetch("http://127.0.0.1:60161/api/whatsapp/webhook",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:{id:"issue-15-wa",from:"5515999990001",text:"iniciar turno"}})});
  assert.equal(whatsapp.status,200);
 } finally {
  child.kill("SIGTERM");
 }
});
