import test from "node:test";
import assert from "node:assert/strict";
import {drivers,providers,resetStore} from "../../src/store.js";
import {rankCandidates} from "../../src/services/queue.js";
import {registerProvider,setProviderEnabled} from "../../src/services/providers.js";

test.beforeEach(resetStore);

test("multiple provider types can be eligible in one city",()=>{
  for(const d of drivers.values()){d.status="AVAILABLE";d.location={lat:-24.112,lng:-49.334};d.activeSecondsToday=3600}
  const ids=new Set(rankCandidates({lat:-24.112,lng:-49.334}).map(x=>x.providerId));
  assert(ids.has("company-demo"));
  assert(ids.has("provider-independent-demo"));
});

test("provider can be registered and disabled without changing another provider",()=>{
  const p=registerProvider({name:"Provider Issue 6",type:"COMPANY",city:"Itararé"});
  assert.equal(providers.get(p.id)?.enabled,true);
  setProviderEnabled(p.id,false);
  assert.equal(providers.get(p.id)?.enabled,false);
  assert.equal(providers.get("company-demo")?.enabled,true);
});
