import test from "node:test";
import assert from "node:assert/strict";
import {drivers,orders,providers,resetStore} from "../../src/store.js";
import {registerProvider,setProviderEnabled,providerForDriver} from "../../src/services/providers.js";
import {createOrder,onPaymentConfirmed} from "../../src/services/orders.js";
import {confirmPayment} from "../../src/services/payments.js";
import {acceptDispatch} from "../../src/services/dispatch.js";
import {rankCandidates} from "../../src/services/queue.js";

test.beforeEach(()=>{resetStore();process.env.FINANCIAL_API="http://127.0.0.1:9"});

function prepare(){
 for(const d of drivers.values()){
  d.status="AVAILABLE";
  d.location={lat:-24.112,lng:-49.334};
  d.sessionId="provider-test";
  d.activeSecondsToday=3600;
  d.completedToday=0;
 }
}

test("company and independent providers can both be eligible in the same city",()=>{
 prepare();
 const candidates=rankCandidates({lat:-24.112,lng:-49.334});
 const providerIds=new Set(candidates.map(x=>x.providerId));
 assert(providerIds.has("company-demo"));
 assert(providerIds.has("provider-independent-demo"));
});

test("provider identity follows the driver without becoming a queue priority",()=>{
 prepare();
 const candidates=rankCandidates({lat:-24.112,lng:-49.334});
 assert.equal(candidates[0].driver.id,"moto-01");
 assert.equal(candidates[0].providerId,"company-demo");
 drivers.get("moto-01")!.completedToday=5;
 drivers.get("moto-02")!.completedToday=5;
 drivers.get("moto-03")!.completedToday=0;
 const reranked=rankCandidates({lat:-24.112,lng:-49.334});
 assert.equal(reranked[0].providerId,"provider-independent-demo");
});

test("dispatch records the provider that actually accepted the service",async()=>{
 prepare();
 const {order,payment}=await createOrder({companyId:"company-demo",customerPhone:"provider",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
 confirmPayment(payment.id);
 const offered=await onPaymentConfirmed(payment.id);
 acceptDispatch(order.id,offered.assignedDriverId!);
 assert.equal(orders.get(order.id)?.assignedProviderId,providerForDriver(offered.assignedDriverId!)?.id);
});

test("disabled provider is excluded from dispatch",()=>{
 prepare();
 setProviderEnabled("provider-independent-demo",false);
 const candidates=rankCandidates({lat:-24.112,lng:-49.334});
 assert(candidates.every(x=>x.providerId!=="provider-independent-demo"));
 assert.equal(providers.get("provider-independent-demo")?.enabled,false);
});

test("new providers can be registered for the same city",()=>{
 const provider=registerProvider({name:"Farmácia Parceira",type:"COMPANY",city:"Itararé"});
 assert.equal(providers.get(provider.id)?.city,"Itararé");
});
