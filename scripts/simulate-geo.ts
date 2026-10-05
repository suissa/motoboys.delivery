import assert from "node:assert/strict";
import {distanceKm, etaMinutes} from "../src/services/geo.js";

const a={lat:-24.112,lng:-49.334}, b={lat:-24.115,lng:-49.330};
const km=distanceKm(a,b);
assert(km>0 && km<1);
assert.equal(etaMinutes(km,30),Math.max(1,Math.ceil(km/30*60)));
console.log(JSON.stringify({simulation:"geo",distanceKm:Number(km.toFixed(3)),etaMinutes:etaMinutes(km)},null,2));
