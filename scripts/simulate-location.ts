import assert from "node:assert/strict";
import {drivers,locationSessions,resetStore} from "../src/store.js";
import {shareDriverLocation,activeDriverLocation,refreshLocationSessions} from "../src/services/location.js";
import {startShift} from "../src/services/shifts.js";

resetStore();
const driver=drivers.get("moto-01")!;
startShift(driver.id,300);
const shared=shareDriverLocation(driver.id,{lat:-24.112,lng:-49.334},{purpose:"DISPATCH",serviceId:"simulation-service",scope:"SERVICE"});
assert.equal(shared.session.scope,"SERVICE");
assert.equal(activeDriverLocation(driver.id)?.location.lat,-24.112);

const session=locationSessions.get(shared.session.id)!;
session.expiresAt=new Date(Date.now()-1000).toISOString();
refreshLocationSessions();

assert.equal(locationSessions.size,0);
assert.equal(drivers.get(driver.id)?.location,undefined);
console.log(JSON.stringify({simulation:"location",serviceScoped:true,expired:true,retainedSessions:locationSessions.size},null,2));
