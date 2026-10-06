import test from "node:test";
import assert from "node:assert/strict";
import {drivers,resetStore} from "../../src/store.js";
import {startShift,endShift,enforceRest} from "../../src/services/shifts.js";
import {effectiveActiveSeconds} from "../../src/services/work-time.js";

test.beforeEach(resetStore);

test("active work time accumulates on shift end without polling",()=>{
  const d=drivers.get("moto-01")!;
  startShift(d.id,300);
  d.activeSinceAt=new Date(Date.now()-5000).toISOString();
  const before=d.activeSecondsToday;
  endShift(d.id);
  assert(d.activeSecondsToday>before);
});

test("resting excludes active time",()=>{
  const d=drivers.get("moto-01")!;
  startShift(d.id,300);
  d.activeSinceAt=new Date(Date.now()-5000).toISOString();
  enforceRest(d.id);
  assert.equal(effectiveActiveSeconds(d,new Date()),d.activeSecondsToday);
});
