import {assertCanonicalScenario,DELIVERY_SCENARIO} from "../src/qa/canonical.js";
import {validTransitions} from "../src/services/dispatch.js";
import assert from "node:assert/strict";

assert.equal(assertCanonicalScenario(DELIVERY_SCENARIO),true);
assert.equal(validTransitions.OFFERED.includes("ASSIGNED"),true);
assert.equal(validTransitions.ARRIVED.includes("AWAITING_CONFIRMATION"),true);
assert.equal(validTransitions.AWAITING_CONFIRMATION.includes("COMPLETED"),true);
assert.equal(validTransitions.COMPLETED.length,0);

console.log(JSON.stringify({
 simulation:"canonical",
 intent:DELIVERY_SCENARIO.intent,
 actions:DELIVERY_SCENARIO.actions.length,
 flow:DELIVERY_SCENARIO.flow,
 channels:["HTTP_API","WHATSAPP"],
 agents:["CUSTOMER","DRIVER","DISPATCH_AGENT","FINANCE_AGENT","NETWORK_AGENT"]
},null,2));
