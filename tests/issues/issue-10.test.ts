import test from "node:test";
import assert from "node:assert/strict";
import {drivers,locationSessions,resetStore} from "../../src/store.js";
import {startShift} from "../../src/services/shifts.js";
import {shareDriverLocation,refreshLocationSessions,activeDriverLocation,endDriverLocation} from "../../src/services/location.js";

test.beforeEach(resetStore);

test("location is scoped and expires instead of becoming permanent tracking",()=>{
 const d=drivers.get("moto-01")!;
 startShift(d.id,300);
 const result=shareDriverLocation(d.id,{lat:-24.112,lng:-49.334},{purpose:"ACTIVE_SERVICE",scope:"SERVICE",serviceId:"service-10"});
 assert.equal(result.session.scope,"SERVICE");
 assert.equal(result.session.serviceId,"service-10");
 result.session.expiresAt=new Date(Date.now()-1000).toISOString();
 refreshLocationSessions();
 assert.equal(activeDriverLocation(d.id),undefined);
 assert.equal(locationSessions.size,0);
});

test("location can be revoked explicitly",()=>{
 const d=drivers.get("moto-01")!;
 startShift(d.id,300);
 shareDriverLocation(d.id,{lat:-24.112,lng:-49.334});
 assert(endDriverLocation(d.id));
 assert.equal(d.location,undefined);
});
