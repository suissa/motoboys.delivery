import type {Company,Driver,Order,Payment,Shift} from "../domain.js";
import type {ProjectionUpdate} from "../persistence/database.js";

export const OPERATIONS_PROJECTION="operations";

const projection=(collection:string,id:string,state:Record<string,unknown>|null):ProjectionUpdate=>({
  projectionName:OPERATIONS_PROJECTION,
  collection,
  entityId:id,
  state
});

export function companyView(c:Company){return projection("companies",c.id,{id:c.id,name:c.name,city:c.city})}
export function driverView(d:Driver){return projection("drivers",d.id,{
  id:d.id,name:d.name,companyId:d.companyId,city:d.city,status:d.status,
  location:d.location,locationAt:d.locationAt,sessionId:d.sessionId,sessionStartedAt:d.sessionStartedAt,
  restUntil:d.restUntil,workDate:d.workDate,activeSinceAt:d.activeSinceAt,completedToday:d.completedToday,activeSecondsToday:d.activeSecondsToday,
  earnedToday:d.earnedToday,lastAssignedAt:d.lastAssignedAt,deliveries:d.deliveries
})}
export function shiftView(s:Shift){return projection("shifts",s.id,{
  id:s.id,driverId:s.driverId,startedAt:s.startedAt,endsAt:s.endsAt,restSecondsRequired:s.restSecondsRequired,status:s.status
})}
export function orderView(o:Order){return projection("orders",o.id,{
  id:o.id,companyId:o.companyId,pickup:o.pickup,destination:o.destination,price:o.price,platformFee:o.platformFee,
  status:o.status,assignedDriverId:o.assignedDriverId,createdAt:o.createdAt,paidAt:o.paidAt,
  assignedAt:o.assignedAt,completedAt:o.completedAt,photoUrl:o.photoUrl,paymentExpiresAt:o.paymentExpiresAt
})}
export function paymentView(p:Payment){return projection("payments",p.id,{
  id:p.id,orderId:p.orderId,price:p.price,expiresAt:p.expiresAt,status:p.status
})}
export function deleteView(collection:string,id:string):ProjectionUpdate{return projection(collection,id,null)}
