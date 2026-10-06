import test from "node:test";
import assert from "node:assert/strict";
import {resetStore} from "../../src/store.js";
import {createOrder} from "../../src/services/orders.js";
import {readDomainEvents} from "../../src/persistence/database.js";
import {runWithObservabilityContext,serviceAuditTimeline,sanitizeForLog} from "../../src/observability.js";

test.beforeEach(resetStore);

test("service events carry correlation and the audit timeline is reconstructable",async()=>{
 const result=await runWithObservabilityContext({correlationId:"issue-14-correlation"},()=>createOrder({companyId:"company-demo",customerPhone:"private-phone",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10}));
 const event=(readDomainEvents() as any[]).find(e=>e.event_type==="ServiceRequested");
 assert.equal(JSON.parse(event.payload_json).correlationId,"issue-14-correlation");
 const timeline=serviceAuditTimeline(result.order.id);
 assert(timeline.length>0);
 const raw=JSON.stringify(timeline);
 assert(raw.includes("issue-14-correlation"));
 assert.equal(raw.includes("private-phone"),false);
 assert.equal(raw.includes("-24.112"),false);
});

test("log sanitizer removes secrets and private location",()=>{
 assert.deepEqual(sanitizeForLog({token:"secret",phone:"5515",location:{lat:1,lng:2},serviceId:"s",status:"ASSIGNED"}),{serviceId:"s",status:"ASSIGNED"});
});
