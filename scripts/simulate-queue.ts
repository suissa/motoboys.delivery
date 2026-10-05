import assert from "node:assert/strict";
import {drivers} from "../src/store.js";
import {rankCandidates,deliveriesPerHour} from "../src/services/queue.js";

for (const d of drivers.values()) { d.status="AVAILABLE"; d.location={lat:-24.112,lng:-49.334}; d.activeSecondsToday=3600; d.completedToday=0; d.lastAssignedAt=undefined; d.restUntil=undefined; d.sessionId="simulation"; }
drivers.get("moto-01")!.completedToday=4;
drivers.get("moto-02")!.completedToday=1;
drivers.get("moto-03")!.completedToday=2;
const ranked=rankCandidates({lat:-24.113,lng:-49.333});
assert.equal(ranked[0].driver.id,"moto-02");
console.log(JSON.stringify({simulation:"queue",ranking:ranked.map(x=>({driver:x.driver.id,deliveriesPerHour:x.deliveriesPerHour,etaMinutes:x.etaMinutes}))},null,2));
