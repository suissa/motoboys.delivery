import test from "node:test";
import assert from "node:assert/strict";
import {drivers,stateHistory,resetStore} from "../../src/store.js";
import {startShift,endShift,enforceRest,refreshRestStates} from "../../src/services/shifts.js";
import {deliveriesPerHour} from "../../src/services/queue.js";
import {dayKey,effectiveActiveSeconds,normalizeWorkDay} from "../../src/services/work-time.js";

test.beforeEach(resetStore);

test("active time is accumulated when a shift ends without polling",()=>{
 const d=drivers.get("moto-01")!;
 startShift(d.id,300);
 d.activeSinceAt=new Date(Date.now()-5000).toISOString();
 const before=d.activeSecondsToday;
 endShift(d.id);
 assert(d.activeSecondsToday>before);
 assert(d.activeSecondsToday>=4);
});

test("rest time is excluded from active time",()=>{
 const d=drivers.get("moto-01")!;
 startShift(d.id,300);
 d.activeSinceAt=new Date(Date.now()-4000).toISOString();
 enforceRest(d.id);
 const afterRestStart=d.activeSecondsToday;
 d.restUntil=new Date(Date.now()-1000).toISOString();
 refreshRestStates();
 assert.equal(drivers.get(d.id)?.activeSecondsToday,afterRestStart);
});

test("queue fairness uses current active time even before persisted counter is updated",()=>{
 const d=drivers.get("moto-01")!;
 startShift(d.id,300);
 d.completedToday=2;
 d.activeSecondsToday=0;
 d.activeSinceAt=new Date(Date.now()-3600_000).toISOString();
 assert.equal(Math.round(deliveriesPerHour(d)),2);
});

test("day rollover resets today's counters and preserves previous active duration in the audit",()=>{
 const d=drivers.get("moto-01")!;
 startShift(d.id,300);
 const yesterday=new Date(Date.now()-86_400_000);
 d.workDate=dayKey(yesterday);
 d.completedToday=5;
 d.activeSecondsToday=3600;
 d.activeSinceAt=new Date(yesterday.getTime()+60_000).toISOString();
 const rollover=normalizeWorkDay(d,new Date());
 assert.notEqual(rollover,undefined);
 assert.equal(d.workDate,dayKey());
 assert.equal(d.completedToday,0);
 assert.equal(d.activeSecondsToday,0);
 assert((rollover?.closedActiveSeconds??0)>=3600);
 assert(stateHistory("drivers").length>0);
});
