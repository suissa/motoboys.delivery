export type LatLng = { lat:number; lng:number };
export type DriverStatus = "AVAILABLE"|"BUSY"|"RESTING"|"OFFLINE";
export type OrderStatus = "AWAITING_PAYMENT"|"PAID"|"SEARCHING_DRIVER"|"ASSIGNED"|"PICKED_UP"|"IN_TRANSIT"|"AWAITING_CONFIRMATION"|"COMPLETED"|"CANCELLED";
export interface Driver { id:string; name:string; phone:string; companyId?:string; city:string; status:DriverStatus; location?:LatLng; locationAt?:string; sessionId?:string; sessionStartedAt?:string; restUntil?:string; completedToday:number; activeSecondsToday:number; earnedToday:number; workDate?:string; activeSinceAt?:string; lastAssignedAt?:string; deliveries:number; }
export interface Shift { id:string; driverId:string; startedAt:string; endsAt:string; restSecondsRequired:number; status:"ACTIVE"|"ENDED"|"RESTING"; }
export interface Quote { providerPrice:number; platformFee:number; customerTotal:number; providerPriceSource:{type:"PROVIDER";id:string}; platformFeeSource:{type:"PLATFORM";id:string}; quotedAt:string; }
export interface Order { id:string; companyId:string; customerPhone:string; pickup:LatLng; destination:LatLng; price:number; providerPrice:number; platformFee:number; customerTotal:number; quote:Quote; status:OrderStatus; paymentId?:string; assignedDriverId?:string; confirmationCode?:string; createdAt:string; paidAt?:string; assignedAt?:string; completedAt?:string; photoUrl?:string; paymentExpiresAt?:string; }
export interface Company { id:string; name:string; city:string; phone:string; }
export interface WorkPolicy { driverId:string; maxShiftSeconds:number; requiredRestSeconds:number; dailyGoalDeliveries?:number; enabled:boolean; }
export interface Payment { id:string; orderId:string; price:number; providerPrice:number; platformFee:number; providerId:string; platformFeeSourceId:string; pixCopyPaste:string; qrCodeDataUrl:string; expiresAt:string; status:"PENDING"|"PAID"|"EXPIRED"; }
export type OutboundMessage = { to:string; text?:string; location?:LatLng & {title?:string; etaMinutes?:number}; };
