import test from "node:test";
import assert from "node:assert/strict";
import {drivers,resetStore} from "../../src/store.js";
import {startShift,endShift,enforceRest} from "../../src/services/shifts.js";
import {dayKey,effectiveActiveSeconds} from "../../src/services/work-time.js";

test.beforeEach(resetStore);

test("active work time accumulates on shift end without polling",()=>{
  let d=drivers.get("moto-01")!;
  const now=new Date();
  d.workDate=dayKey(now);
  d.activeSecondsToday=0;

  startShift(d.id,300);

  // Transactions replace persisted entity snapshots; always re-read the proxy
  // after a service call instead of mutating/asserting against a stale object.
  d=drivers.get("moto-01")!;
  d.activeSinceAt=new Date(now.getTime()-5000).toISOString();

  endShift(d.id);

  d=drivers.get("moto-01")!;
  assert(d.activeSecondsToday>0, `expected shift end to accumulate active time (after=${d.activeSecondsToday})`);
});

test("resting excludes active time",()=>{
  let d=drivers.get("moto-01")!;
  d.workDate=dayKey();
  d.activeSecondsToday=0;
  startShift(d.id,300);
  d=drivers.get("moto-01")!;
  d.activeSinceAt=new Date(Date.now()-5000).toISOString();
  enforceRest(d.id);
  d=drivers.get("moto-01")!;
  assert.equal(effectiveActiveSeconds(d,new Date()),d.activeSecondsToday);
});
