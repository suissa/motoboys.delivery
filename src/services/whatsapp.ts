import crypto from "node:crypto";
import type {LatLng,OutboundMessage} from "../domain.js";

export type IncomingWhatsApp={
 id?:string;
 from?:string;
 text?:string;
 location?:LatLng;
 mediaUrl?:string;
 mediaId?:string;
 type?:string;
};

export interface WhatsAppGateway{
 send(message:OutboundMessage):Promise<void>;
}

class MockWhatsApp implements WhatsAppGateway{
 async send(m:OutboundMessage){console.log("[WHATSAPP OUT]",JSON.stringify(m))}
}

export type OfficialConfig={
 graphBaseUrl:string;
 graphVersion:string;
 phoneNumberId:string;
 accessToken:string;
 appSecret:string;
 verifyToken:string;
 maxAttempts:number;
};

function officialConfig():OfficialConfig{
 const graphBaseUrl=(process.env.WHATSAPP_GRAPH_BASE_URL??"https://graph.facebook.com").replace(/\/$/,"");
 const graphVersion=process.env.WHATSAPP_GRAPH_VERSION;
 const phoneNumberId=process.env.WHATSAPP_PHONE_NUMBER_ID;
 const accessToken=process.env.WHATSAPP_ACCESS_TOKEN;
 const appSecret=process.env.WHATSAPP_APP_SECRET;
 const verifyToken=process.env.WHATSAPP_VERIFY_TOKEN;
 if(!graphVersion||!phoneNumberId||!accessToken||!appSecret||!verifyToken)throw Error("Configuração oficial do WhatsApp incompleta");
 return{graphBaseUrl,graphVersion,phoneNumberId,accessToken,appSecret,verifyToken,maxAttempts:Math.max(1,Number(process.env.WHATSAPP_MAX_ATTEMPTS??3))};
}

function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}

function locationPayload(message:OutboundMessage){
 if(!message.location)return undefined;
 return{
  messaging_product:"whatsapp",
  to:message.to,
  type:"location",
  location:{
   latitude:message.location.lat,
   longitude:message.location.lng,
   name:message.location.title
  }
 };
}

function textPayload(message:OutboundMessage){
 if(!message.text)return undefined;
 return{
  messaging_product:"whatsapp",
  to:message.to,
  type:"text",
  text:{body:message.text}
 };
}

export class OfficialWhatsApp implements WhatsAppGateway{
 constructor(private readonly config:OfficialConfig){}
 private async sendPayload(payload:Record<string,unknown>){
  const url=`${this.config.graphBaseUrl}/${this.config.graphVersion}/${this.config.phoneNumberId}/messages`;
  let lastError:Error|undefined;
  for(let attempt=1;attempt<=this.config.maxAttempts;attempt++){
   try{
    const response=await fetch(url,{
     method:"POST",
     headers:{
      "content-type":"application/json",
      authorization:`Bearer ${this.config.accessToken}`
     },
     body:JSON.stringify(payload)
    });
    if(response.ok)return;
    const body=await response.text();
    if(response.status!==429&&response.status<500)throw Error(`WhatsApp Graph API ${response.status}: ${body}`);
    lastError=Error(`WhatsApp Graph API ${response.status}: ${body}`);
   }catch(error){
    lastError=error instanceof Error?error:Error(String(error));
   }
   if(attempt<this.config.maxAttempts)await sleep(250*2**(attempt-1));
  }
  throw lastError??Error("Falha ao enviar mensagem WhatsApp");
 }
 async send(message:OutboundMessage){
  const text=message.text?textPayload(message):undefined;
  const location=message.location?locationPayload(message):undefined;
  if(text)await this.sendPayload(text);
  if(location)await this.sendPayload(location);
 }
}

function signatureBuffer(rawBody:string,signature:string,secret:string){
 const normalized=signature.startsWith("sha256=")?signature.slice(7):signature;
 const expected=crypto.createHmac("sha256",secret).update(rawBody).digest("hex");
 const a=Buffer.from(expected,"hex");
 const b=Buffer.from(normalized,"hex");
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

export function verifyOfficialWebhook(rawBody:string,signature:string|undefined,secret=process.env.WHATSAPP_APP_SECRET??""){
 if(!signature||!secret)return false;
 return signatureBuffer(rawBody,signature,secret);
}

export function verifyWebhookChallenge(input:{mode?:string;verifyToken?:string;challenge?:string},verifyToken=process.env.WHATSAPP_VERIFY_TOKEN??""){
 return input.mode==="subscribe"&&!!verifyToken&&input.verifyToken===verifyToken?input.challenge:undefined;
}

export function parseIncoming(body:any):IncomingWhatsApp{
 return parseIncomingMany(body)[0]??{};
}

export function parseIncomingMany(body:any):IncomingWhatsApp[]{
 const raw=Array.isArray(body?.entry)
  ? body.entry.flatMap((entry:any)=>entry?.changes??[]).flatMap((change:any)=>change?.value?.messages??[])
  : Array.isArray(body?.messages)?body.messages:[body?.message??body];

 return raw.filter(Boolean).map((m:any)=>({
  id:m?.id,
  from:m?.from??m?.sender?.phone,
  text:m?.text?.body??m?.text,
  location:m?.location?{lat:Number(m.location.latitude??m.location.lat),lng:Number(m.location.longitude??m.location.lng)} as LatLng:undefined,
  mediaUrl:m?.image?.url??m?.media?.url,
  mediaId:m?.image?.id??m?.document?.id??m?.video?.id??m?.audio?.id,
  type:m?.type
 }));
}

const mode=process.env.WHATSAPP_MODE??"mock";
export const whatsapp:WhatsAppGateway=mode==="official"?new OfficialWhatsApp(officialConfig()):new MockWhatsApp();
export const whatsappMode=mode;
