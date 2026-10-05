import test from "node:test";
import assert from "node:assert/strict";
import {drivers,resetStore} from "../../src/store.js";
import {setWorkPolicy} from "../../src/services/work-policy.js";
import {startShift,endShift,enforceRest} from "../../src/services/shifts.js";
import {rankCandidates} from "../../src/services/queue.js";

test.beforeEach(resetStore);

test("policy caps shift duration",()=>{
 setWorkPolicy("moto-01",{maxShiftSeconds:60,requiredRestSeconds:5,dailyGoalDeliveries:10});
 const shift=startShift("moto-01",300);
 const seconds=(Date.parse(shift.endsAt)-Date.parse(shift.startedAt))/1000;
 assert.equal(seconds,60);
 assert.equal(shift.restSecondsRequired,5);
});

test("daily goal is informational and does not punish the driver",()=>{
 setWorkPolicy("moto-01",{dailyGoalDeliveries:20});
 const d=drivers.get("moto-01")!;
 startShift(d.id,300);
 d.location={lat:-24.112,lng:-49.334};
 assert.equal(rankCandidates({lat:-24.112,lng:-49.334})[0].driver.id,d.id);
});

test("disabled policy removes a driver from dispatch",()=>{
 setWorkPolicy("moto-01",{enabled:false});
 const d=drivers.get("moto-01")!;
 startShift(d.id,300);
 d.location={lat:-24.112,lng:-49.334};
 assert.equal(rankCandidates({lat:-24.112,lng:-49.334}).some(x=>x.driver.id===d.id),false);
});

test("manual shift end has no delivery penalty",()=>{
 const d=drivers.get("moto-01")!;
 d.deliveries=7;
 startShift(d.id,300);
 endShift(d.id);
 assert.equal(d.deliveries,7);
 assert.equal(d.status,"OFFLINE");
});

test("rest blocks dispatch while allowing the shift to remain active",()=>{
 const d=drivers.get("moto-01")!;
 startShift(d.id,300);
 d.location={lat:-24.112,lng:-49.334};
 enforceRest(d.id);
 assert.equal(d.status,"RESTING");
 assert.equal(rankCandidates({lat:-24.112,lng:-49.334}).some(x=>x.driver.id===d.id),false);
});
