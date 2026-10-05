import type {LatLng,OutboundMessage} from "../domain.js";
export interface WhatsAppGateway{send(message:OutboundMessage):Promise<void>}
class MockWhatsApp implements WhatsAppGateway{async send(m:OutboundMessage){console.log("[WHATSAPP OUT]",JSON.stringify(m))}}
export const whatsapp:WhatsAppGateway=new MockWhatsApp();
export function parseIncoming(body:any){const m=body?.message??body;return{from:m?.from??m?.sender?.phone,text:m?.text?.body??m?.text,location:m?.location?{lat:Number(m.location.latitude??m.location.lat),lng:Number(m.location.longitude??m.location.lng)} as LatLng:undefined,mediaUrl:m?.image?.url??m?.media?.url}}
