import test from "node:test";
import assert from "node:assert/strict";
import {drivers,resetStore} from "../../src/store.js";
import {setWorkPolicy} from "../../src/services/work-policy.js";
import {startShift,enforceRest,endShift} from "../../src/services/shifts.js";
import {rankCandidates} from "../../src/services/queue.js";

test.beforeEach(resetStore);

test("work policy caps shifts and blocks dispatch during required rest",()=>{
 setWorkPolicy("moto-01",{maxShiftSeconds:60,requiredRestSeconds:5,dailyGoalDeliveries:20});
 const shift=startShift("moto-01",300);
 assert.equal((Date.parse(shift.endsAt)-Date.parse(shift.startedAt))/1000,60);
 const d=drivers.get("moto-01")!;
 d.location={lat:-24.112,lng:-49.334};
 enforceRest(d.id);
 assert.equal(d.status,"RESTING");
 assert.equal(rankCandidates({lat:-24.112,lng:-49.334}).some(x=>x.driver.id===d.id),false);
 endShift(d.id);
 assert.equal(d.deliveries,0);
});

test("daily goal is informational rather than a dispatch penalty",()=>{
 setWorkPolicy("moto-01",{dailyGoalDeliveries:50});
 const d=drivers.get("moto-01")!;
 startShift(d.id,300);
 d.location={lat:-24.112,lng:-49.334};
 assert.equal(rankCandidates({lat:-24.112,lng:-49.334}).some(x=>x.driver.id===d.id),true);
});
