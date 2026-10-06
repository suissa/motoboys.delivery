import test from "node:test";
import assert from "node:assert/strict";
import {drivers,orders,resetStore} from "../../src/store.js";
import {createOrder} from "../../src/services/orders.js";
import {reserveCapacityForOrder,capacityForCity} from "../../src/services/capacity.js";

test.beforeEach(resetStore);

test("network capacity is insufficient when no eligible driver exists",async()=>{
  for(const d of drivers.values())d.status="OFFLINE";
  const {order}=await createOrder({companyId:"company-demo",customerPhone:"issue-05",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:10});
  const result=reserveCapacityForOrder(order.id);
  assert.equal(result.reserved,false);
  assert.equal(orders.get(order.id)?.capacityStatus,"INSUFFICIENT");
});

test("capacity reports available and committed units",()=>{
  const d=drivers.get("moto-01")!;
  d.status="AVAILABLE"; d.location={lat:-24.112,lng:-49.334};
  const city=capacityForCity("Itararé");
  assert(city.availableCapacity>=1);
  assert(city.committedReservations>=0);
});
