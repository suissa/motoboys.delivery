import test from "node:test";
import assert from "node:assert/strict";
import {drivers,locationSessions,resetStore} from "../../src/store.js";
import {shareDriverLocation,activeDriverLocation,refreshLocationSessions,endDriverLocation} from "../../src/services/location.js";
import {startShift} from "../../src/services/shifts.js";

test.beforeEach(resetStore);

test("location is stored only inside an active session and can be revoked",()=>{
 const d=drivers.get("moto-01")!;
 startShift(d.id,300);
 const result=shareDriverLocation(d.id,{lat:-24.112,lng:-49.334});
 assert(result.session.scope==="NETWORK");
 assert.equal(activeDriverLocation(d.id)?.location.lat,-24.112);
 assert.equal(locationSessions.size,1);
 endDriverLocation(d.id);
 assert.equal(activeDriverLocation(d.id),undefined);
 assert.equal(locationSessions.size,0);
 assert.equal(drivers.get(d.id)?.location,undefined);
});

test("service location receives a service scope and expires",()=>{
 const d=drivers.get("moto-01")!;
 startShift(d.id,300);
 const result=shareDriverLocation(d.id,{lat:-24.112,lng:-49.334},{purpose:"DISPATCH",serviceId:"service-1",scope:"SERVICE"});
 assert.equal(result.session.serviceId,"service-1");
 assert.equal(result.session.scope,"SERVICE");
 const session=locationSessions.get(result.session.id)!;
 session.expiresAt=new Date(Date.now()-1000).toISOString();
 refreshLocationSessions();
 assert.equal(locationSessions.size,0);
 assert.equal(drivers.get(d.id)?.location,undefined);
});

test("location event does not need to persist coordinates in session metadata",()=>{
 const d=drivers.get("moto-01")!;
 startShift(d.id,300);
 const result=shareDriverLocation(d.id,{lat:-24.112,lng:-49.334});
 assert.equal("location" in result.session,false);
});
