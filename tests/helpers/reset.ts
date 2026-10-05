import {companies,drivers,orders,payments,shifts} from "../../src/store.js";
export function resetState(){
  for(const [id,d] of drivers){d.status="OFFLINE";d.location=undefined;d.locationAt=undefined;d.sessionId=undefined;d.sessionStartedAt=undefined;d.restUntil=undefined;d.completedToday=0;d.activeSecondsToday=0;d.earnedToday=0;d.lastAssignedAt=undefined;d.deliveries=0;drivers.set(id,d)}
  orders.clear();payments.clear();shifts.clear();void companies;
}
