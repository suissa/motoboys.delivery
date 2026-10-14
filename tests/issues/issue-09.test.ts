import test from "node:test";
import assert from "node:assert/strict";
import {OfficialWhatsApp,parseIncomingMany,verifyOfficialWebhook,verifyWebhookChallenge} from "../../src/services/whatsapp.js";
import crypto from "node:crypto";

test("official webhook parser normalizes text, location and media",()=>{
 const messages=parseIncomingMany({entry:[{changes:[{value:{messages:[{id:"wamid-1",from:"5515",text:{body:"oi"},location:{latitude:"-24.1",longitude:"-49.3"},image:{id:"img-1"}}]}}]}]});
 assert.deepEqual(messages[0],{id:"wamid-1",from:"5515",text:"oi",location:{lat:-24.1,lng:-49.3},mediaUrl:undefined,mediaId:"img-1",type:undefined});
});

test("official webhook verifies HMAC challenge",()=>{
 const raw="{\"entry\":[]}";
 const secret="wa-secret";
 const sig="sha256="+crypto.createHmac("sha256",secret).update(raw).digest("hex");
 assert.equal(verifyOfficialWebhook(raw,sig,secret),true);
 assert.equal(verifyOfficialWebhook(raw,sig+"0",secret),false);
 assert.equal(verifyWebhookChallenge({mode:"subscribe",verifyToken:"verify",challenge:"123"},"verify"),"123");
});

test("official gateway retries temporary failures",async()=>{
 const old=globalThis.fetch;
 let attempts=0;
 globalThis.fetch=(async()=>{attempts++;return attempts<3?new Response("temporary",{status:500}):new Response("ok",{status:200})}) as typeof fetch;
 try{
  const gateway=new OfficialWhatsApp({graphBaseUrl:"https://example.test",graphVersion:"v1",phoneNumberId:"phone",accessToken:"token",appSecret:"secret",verifyToken:"verify",maxAttempts:3});
  await gateway.send({to:"5515",text:"teste"});
  assert.equal(attempts,3);
 }finally{globalThis.fetch=old}
});
