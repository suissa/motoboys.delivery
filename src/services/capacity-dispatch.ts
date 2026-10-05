import {companies,orders} from "../store.js";
import {reserveCapacityForOrder} from "./capacity.js";
import {dispatchSearch} from "./dispatch.js";

export function retryInsufficientCapacity(city?:string){
 const targets=[...orders.values()].filter(order=>{
  if(order.status!=="SEARCHING_DRIVER"||order.capacityStatus!=="INSUFFICIENT")return false;
  const company=companies.get(order.companyId);
  return !!company&&(!city||company.city===city);
 });
 const dispatched:string[]=[];
 for(const order of targets){
  const reservation=reserveCapacityForOrder(order.id);
  if(!reservation.reserved)continue;
  const offered=dispatchSearch(order.id);
  if(offered?.status==="OFFERED")dispatched.push(order.id);
 }
 return dispatched;
}
