import test from "node:test";
import assert from "node:assert/strict";
import {drivers,resetStore} from "../../src/store.js";
import {startShift,endShift,enforceRest} from "../../src/services/shifts.js";
import {dayKey,effectiveActiveSeconds} from "../../src/services/work-time.js";

test.beforeEach(resetStore);

test("active work time accumulates on shift end without polling",()=>{
  const d=drivers.get("moto-01")!;
  const now=new Date();
  // Avoid persisted seed data from a previous workday resetting the counter
  // while this test measures the active interval.
  d.workDate=dayKey(now);
  d.activeSecondsToday=0;
  startShift(d.id,300);
  d.activeSinceAt=new Date(now.getTime()-5000).toISOString();
  const before=d.activeSecondsToday;
  endShift(d.id);
  assert(d.activeSecondsToday>before, `expected shift end to accumulate active time (before=${before}, after=${d.activeSecondsToday})`);
});

test("resting excludes active time",()=>{
  const d=drivers.get("moto-01")!;
  d.workDate=dayKey();
  d.activeSecondsToday=0;
  startShift(d.id,300);
  d.activeSinceAt=new Date(Date.now()-5000).toISOString();
  enforceRest(d.id);
  assert.equal(effectiveActiveSeconds(d,new Date()),d.activeSecondsToday);
});
