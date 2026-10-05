import assert from "node:assert/strict";
import {drivers,resetStore} from "../src/store.js";
import {setWorkPolicy} from "../src/services/work-policy.js";
import {startShift,endShift,enforceRest} from "../src/services/shifts.js";
import {rankCandidates} from "../src/services/queue.js";

resetStore();
setWorkPolicy("moto-01",{maxShiftSeconds:60,requiredRestSeconds:5,dailyGoalDeliveries:10});
const shift=startShift("moto-01",300);
assert.equal((Date.parse(shift.endsAt)-Date.parse(shift.startedAt))/1000,60);

const d=drivers.get("moto-01")!;
d.location={lat:-24.112,lng:-49.334};
assert.equal(rankCandidates({lat:-24.112,lng:-49.334})[0].driver.id,"moto-01");

enforceRest(d.id);
assert.equal(rankCandidates({lat:-24.112,lng:-49.334}).some(x=>x.driver.id==="moto-01"),false);

endShift(d.id);
assert.equal(d.status,"OFFLINE");
console.log(JSON.stringify({simulation:"work-policy",maxShiftSeconds:60,requiredRestSeconds:5,goal:"informational",manualEndWithoutPenalty:true},null,2));
