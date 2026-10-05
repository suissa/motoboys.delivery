import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {parseIncoming,parseIncomingMany,verifyOfficialWebhook,verifyWebhookChallenge} from "../../src/services/whatsapp.js";

test("official webhook payload is normalized to the same inbound contract",()=>{
 const payload={
  object:"whatsapp_business_account",
  entry:[{changes:[{value:{messages:[
   {id:"wamid.1",from:"5515999990001",type:"text",text:{body:"aceitar"}},
   {id:"wamid.2",from:"5515999990002",type:"location",location:{latitude:-24.11,longitude:-49.33}},
   {id:"wamid.3",from:"5515999990003",type:"image",image:{id:"media-3"}}
  ]}}]}]
 };
 const messages=parseIncomingMany(payload);
 assert.equal(messages.length,3);
 assert.equal(messages[0].text,"aceitar");
 assert.deepEqual(messages[1].location,{lat:-24.11,lng:-49.33});
 assert.equal(messages[2].mediaId,"media-3");
 assert.equal(parseIncoming(payload).id,"wamid.1");
});

test("official webhook signature uses HMAC SHA-256",()=>{
 const body=JSON.stringify({entry:[]});
 const secret="app-secret";
 const signature="sha256="+crypto.createHmac("sha256",secret).update(body).digest("hex");
 assert.equal(verifyOfficialWebhook(body,signature,secret),true);
 assert.equal(verifyOfficialWebhook(body,"sha256=invalid",secret),false);
});

test("Meta webhook challenge is accepted only for subscribe and matching token",()=>{
 assert.equal(verifyWebhookChallenge({mode:"subscribe",verifyToken:"verify",challenge:"123"},"verify"),"123");
 assert.equal(verifyWebhookChallenge({mode:"subscribe",verifyToken:"wrong",challenge:"123"},"verify"),undefined);
 assert.equal(verifyWebhookChallenge({mode:"not-subscribe",verifyToken:"verify",challenge:"123"},"verify"),undefined);
});
