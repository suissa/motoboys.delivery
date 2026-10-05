import test from "node:test";
import assert from "node:assert/strict";
import {createOrder} from "../../src/services/orders.js";
import {readDomainEvents} from "../../src/persistence/database.js";
import {resetStore} from "../helpers/reset.js";
import {runWithObservabilityContext,serviceAuditTimeline,sanitizeForLog} from "../../src/observability.js";

test.beforeEach(resetStore);

test("domain events inherit correlationId and serviceId from observability context",async()=>{
 const result=await runWithObservabilityContext({correlationId:"corr-observe"},()=>createOrder({
  companyId:"company-demo",
  customerPhone:"5515999991000",
  pickup:{lat:-24.112,lng:-49.334},
  destination:{lat:-24.115,lng:-49.330},
  price:10
 }));
 const event=(readDomainEvents() as any[]).find(x=>x.event_type==="ServiceRequested");
 assert.equal(JSON.parse(event.payload_json).correlationId,"corr-observe");
 assert.equal(JSON.parse(event.payload_json).serviceId,result.order.id);
});

test("service audit removes private channel data and coordinates",async()=>{
 const result=await runWithObservabilityContext({correlationId:"corr-audit"},()=>createOrder({
  companyId:"company-demo",
  customerPhone:"5515999991000",
  pickup:{lat:-24.112,lng:-49.334},
  destination:{lat:-24.115,lng:-49.330},
  price:10
 }));
 const timeline=serviceAuditTimeline(result.order.id);
 assert(timeline.length>0);
 const serialized=JSON.stringify(timeline);
 assert.equal(serialized.includes("5515999991000"),false);
 assert.equal(serialized.includes("-24.112"),false);
 assert.equal(serialized.includes("corr-audit"),true);
});

test("generic log sanitizer removes credentials and channel addresses",()=>{
 const value=sanitizeForLog({token:"secret",phone:"5515",location:{lat:1,lng:2},serviceId:"s1",status:"ASSIGNED"});
 assert.deepEqual(value,{serviceId:"s1",status:"ASSIGNED"});
});
