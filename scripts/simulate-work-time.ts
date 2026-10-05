import assert from "node:assert/strict";
import {drivers,resetStore} from "../src/store.js";
import {startShift,endShift,enforceRest,refreshRestStates} from "../src/services/shifts.js";
import {deliveriesPerHour} from "../src/services/queue.js";

resetStore();
const d=drivers.get("moto-01")!;
startShift(d.id,300);
d.activeSinceAt=new Date(Date.now()-5000).toISOString();
endShift(d.id);
assert(d.activeSecondsToday>=4);

startShift(d.id,300);
d.activeSinceAt=new Date(Date.now()-3000).toISOString();
enforceRest(d.id);
const afterRest=d.activeSecondsToday;
d.restUntil=new Date(Date.now()-1000).toISOString();
refreshRestStates();
assert.equal(drivers.get(d.id)?.activeSecondsToday,afterRest);

const current=drivers.get(d.id)!;
current.status="AVAILABLE";
current.sessionId=current.sessionId??"simulation";
current.workDate=new Date().toISOString().slice(0,10);
current.completedToday=2;
current.activeSecondsToday=0;
current.activeSinceAt=new Date(Date.now()-3600000).toISOString();
assert.equal(Math.round(deliveriesPerHour(current)),2);

console.log(JSON.stringify({simulation:"work-time",activeSecondsToday:current.activeSecondsToday,fairnessDeliveriesPerHour:deliveriesPerHour(current),restExcluded:true},null,2));
