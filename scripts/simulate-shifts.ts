import assert from "node:assert/strict";
import {drivers,shifts} from "../src/store.js";
import {startShift,endShift,enforceRest,refreshRestStates} from "../src/services/shifts.js";

const d=drivers.get("moto-01")!;
d.status="OFFLINE"; d.sessionId=undefined; d.restUntil=undefined;
const shift=startShift(d.id,2);
assert.equal(d.status,"AVAILABLE");
assert.equal(shifts.get(shift.id)?.status,"ACTIVE");
const until=enforceRest(d.id);
assert.equal(d.status,"RESTING");
assert(until);
d.restUntil=new Date(Date.now()-1000).toISOString();
refreshRestStates();
assert.equal(d.status,"AVAILABLE");
endShift(d.id);
assert.equal(d.status,"OFFLINE");
console.log(JSON.stringify({simulation:"shifts",shiftId:shift.id,status:d.status},null,2));
