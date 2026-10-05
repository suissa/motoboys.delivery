export type LatLng = { lat:number; lng:number };
export type DriverStatus = "AVAILABLE"|"BUSY"|"RESTING"|"OFFLINE";
export type OrderStatus = "AWAITING_PAYMENT"|"PAID"|"SEARCHING_DRIVER"|"OFFERED"|"ASSIGNED"|"PICKED_UP"|"IN_TRANSIT"|"ARRIVED"|"AWAITING_CONFIRMATION"|"COMPLETED"|"CANCELLED";
export interface Driver { id:string; name:string; phone:string; companyId?:string; providerId?:string; city:string; status:DriverStatus; location?:LatLng; locationAt?:string; sessionId?:string; sessionStartedAt?:string; restUntil?:string; completedToday:number; activeSecondsToday:number; earnedToday:number; workDate?:string; activeSinceAt?:string; lastAssignedAt?:string; deliveries:number; }
export interface Shift { id:string; driverId:string; startedAt:string; endsAt:string; restSecondsRequired:number; status:"ACTIVE"|"ENDED"|"RESTING"; }
export type LocationPurpose="WORK_START"|"DISPATCH"|"ACTIVE_SERVICE";
export type LocationScope="NETWORK"|"SERVICE";
export type CapacityStatus="UNKNOWN"|"PROMISED"|"INSUFFICIENT"|"RELEASED";
export type ProviderType="COMPANY"|"INDEPENDENT";
export interface Provider { id:string; name:string; type:ProviderType; city:string; phone?:string; enabled:boolean; createdAt:string; }
export interface CapacityReservation { id:string; orderId:string; city:string; reservedAt:string; status:"ACTIVE"|"RELEASED"; releasedAt?:string; }
export interface LocationSession { id:string; actorType:"DRIVER"|"CUSTOMER"; actorId:string; serviceId?:string; purpose:LocationPurpose; scope:LocationScope; startedAt:string; expiresAt:string; }
export interface Quote { providerPrice:number; platformFee:number; customerTotal:number; providerPriceSource:{type:"PROVIDER";id:string}; platformFeeSource:{type:"PLATFORM";id:string}; quotedAt:string; }
export interface Order { id:string; companyId:string; customerPhone:string; pickup:LatLng; destination:LatLng; price:number; providerPrice:number; platformFee:number; customerTotal:number; quote:Quote; status:OrderStatus; paymentId?:string; assignedDriverId?:string; assignedProviderId?:string; dispatchOfferId?:string; dispatchExcludedDriverIds?:string[]; offerExpiresAt?:string; offeredAt?:string; acceptedAt?:string; pickedUpAt?:string; inTransitAt?:string; arrivedAt?:string; confirmationCode?:string; createdAt:string; paidAt?:string; assignedAt?:string; completedAt?:string; photoUrl?:string; paymentExpiresAt?:string; }
export interface Company { id:string; name:string; city:string; phone:string; }
export interface WorkPolicy { driverId:string; maxShiftSeconds:number; requiredRestSeconds:number; dailyGoalDeliveries?:number; enabled:boolean; }
export interface Payment { id:string; orderId:string; price:number; providerPrice:number; platformFee:number; providerId:string; platformFeeSourceId:string; pixCopyPaste:string; qrCodeDataUrl:string; expiresAt:string; status:"PENDING"|"PAID"|"EXPIRED"; }
export type OutboundMessage = { to:string; text?:string; location?:LatLng & {title?:string; etaMinutes?:number}; };
