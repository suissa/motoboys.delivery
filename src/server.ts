import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs/promises";
import {fileURLToPath} from "node:url";
import YAML from "yaml";
import {companies,drivers,orders,payments,shifts,subscribe,changed,transaction} from "./store.js";
import {parseIncomingMany,verifyOfficialWebhook,verifyWebhookChallenge,whatsappMode} from "./services/whatsapp.js";
import {startShift,endShift,enforceRest,refreshRestStates} from "./services/shifts.js";
import {createOrder,onPaymentConfirmed,completeOrder} from "./services/orders.js";
import {confirmPayment} from "./services/payments.js";
import {distanceKm} from "./services/geo.js";
import {deliveriesPerHour} from "./services/queue.js";
import {ensureDomainEventBaseline,rebuildOperationalProjections,emitDomainEvent,operationalProjection} from "./events.js";
import {driverView,orderView} from "./projections/operations.js";
import type {LatLng,Order} from "./domain.js";
import {normalizeWorkDay} from "./services/work-time.js";
import {getWorkPolicy,setWorkPolicy} from "./services/work-policy.js";
import {acceptDispatch,rejectDispatch,expireDispatchOffers,requestDeliveryConfirmation,transitionDelivery} from "./services/dispatch.js";
import {capacityCities} from "./services/capacity.js";import {retryInsufficientCapacity} from "./services/capacity-dispatch.js";import {listProviders,registerProvider,setProviderEnabled} from "./services/providers.js";
import {observeInbound,sendTwinMessage,twinContext,twinForService} from "./services/twins.js";
import {log,runWithObservabilityContext,serviceAuditTimeline,newCorrelationId} from "./observability.js";
import {shareDriverLocation,endDriverLocation,refreshLocationSessions} from "./services/location.js";
import {settlePayment,paymentWebhookSignature,verifyPaymentWebhookSignature} from "./services/finance.js";
import crypto from "node:crypto";
import {claimChannelMessage,ledgerTotals,readLedger} from "./persistence/database.js";

ensureDomainEventBaseline();
rebuildOperationalProjections();

const app=express();
app.use(cors());
app.use((req,res,next)=>{const correlationId=String(req.header("x-correlation-id")??newCorrelationId());const match=req.path.match(/\/(?:orders|services)\/([^/]+)/);res.setHeader("x-correlation-id",correlationId);runWithObservabilityContext({correlationId,serviceId:match?.[1]},()=>{log("info","http.request",{method:req.method,path:req.path});next()})});
app.use(express.json({limit:"5mb",verify:(req,_res,buf)=>{(req as express.Request & {rawBody?:Buffer}).rawBody=Buffer.from(buf)}}));
const __dirname=path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.resolve(__dirname,"../public")));

function projected<T=any>(collection:string){return operationalProjection(collection) as T[]}
function normalizeDailyWork(){transaction(()=>{for(const d of drivers.values()){const rollover=normalizeWorkDay(d,new Date());if(rollover)emitDomainEvent({type:"WorkDayRolledOver",aggregateType:"driver",aggregateId:d.id,payload:{driverId:d.id,previousWorkDate:rollover.workDate,previousCompletedToday:rollover.completedToday,previousActiveSecondsToday:rollover.closedActiveSeconds,previousEarnedToday:rollover.earnedToday},projections:[driverView(d)]})}})}
function completed(){return projected<Order>("orders").filter(o=>o.status==="COMPLETED")}

function metrics(){
 const now=Date.now(),rows=completed(),w={hour:36e5,day:864e5,week:6048e5,month:2592e6};
 const agg=(ms:number,subset=rows)=>{
  const r=subset.filter(o=>now-Date.parse(o.completedAt??o.createdAt)<=ms);
  return{deliveries:r.length,money:r.reduce((s,o)=>s+(o.customerTotal??o.price),0),platformFees:r.reduce((s,o)=>s+o.platformFee,0)}
 };
 return{
  city:{hour:agg(w.hour),day:agg(w.day),week:agg(w.week),month:agg(w.month)},
  company:Object.fromEntries(projected<any>("companies").map(c=>[c.id,{
   hour:agg(w.hour,rows.filter(o=>o.companyId===c.id)),
   day:agg(w.day,rows.filter(o=>o.companyId===c.id)),
   week:agg(w.week,rows.filter(o=>o.companyId===c.id)),
   month:agg(w.month,rows.filter(o=>o.companyId===c.id))
  }])),
  drivers:Object.fromEntries(projected<any>("drivers").map(d=>{const subset=rows.filter(o=>o.assignedDriverId===d.id);return[d.id,{hour:agg(w.hour,subset),day:agg(w.day,subset),week:agg(w.week,subset),month:agg(w.month,subset)}]}))
 };
}

async function layoutConfig(){return YAML.parse(await fs.readFile(path.resolve(__dirname,"../src/configs/layout.yml"),"utf8"))}

function snapshot(){
 refreshRestStates();
 refreshLocationSessions();
 normalizeDailyWork();
 const ds=projected<any>("drivers"),os=projected<any>("orders"),ps=projected<any>("payments");
 return{
  now:new Date().toISOString(),
  companies:projected("companies"),
  drivers:ds.map(d=>({...d,deliveriesPerHour:Number(deliveriesPerHour(d).toFixed(2))})),
  shifts:projected("shifts"),
  orders:os,
  payments:ps,
  workPolicies:projected("work_policies"),
  providers:projected("providers"),
  capacity:capacityCities(),
  metrics:metrics(),
  totals:{
   deliveredToday:os.filter(o=>o.status==="COMPLETED").length,
   receivedToday:os.filter(o=>o.status==="COMPLETED").reduce((s,o)=>s+(o.customerTotal??o.price),0),
   platformFeesToday:os.filter(o=>o.status==="COMPLETED").reduce((s,o)=>s+o.platformFee,0)
  }
 };
}

app.get("/api/config/layout",async(_q,r)=>r.json(await layoutConfig()));
app.get("/api/state",(_q,r)=>r.json(snapshot()));
app.get("/api/events",(q,r)=>{
 r.setHeader("content-type","text/event-stream");
 r.setHeader("cache-control","no-cache");
 r.setHeader("connection","keep-alive");
 r.write(`data: ${JSON.stringify(snapshot())}\n\n`);
 const off=subscribe(()=>r.write(`data: ${JSON.stringify(snapshot())}\n\n`));
 q.on("close",off);
});

app.get("/api/whatsapp/webhook",(req,res)=>{
 const challenge=verifyWebhookChallenge({
  mode:typeof req.query["hub.mode"]==="string"?req.query["hub.mode"]:undefined,
  verifyToken:typeof req.query["hub.verify_token"]==="string"?req.query["hub.verify_token"]:undefined,
  challenge:typeof req.query["hub.challenge"]==="string"?req.query["hub.challenge"]:undefined
 });
 if(challenge!==undefined)return res.status(200).type("text/plain").send(challenge);
 return res.status(403).json({error:"verificação WhatsApp inválida"});
});

async function handleIncomingWhatsApp(i:any,correlationId:string){
 if(!i.from)return;
 const d=[...drivers.values()].find(x=>x.phone===i.from);
 if(d){
  if(i.location){
   const activeOrder=[...orders.values()].find(x=>x.assignedDriverId===d.id&&!["COMPLETED","CANCELLED"].includes(x.status));
   shareDriverLocation(d.id,i.location,{purpose:activeOrder?"ACTIVE_SERVICE":"WORK_START",scope:activeOrder?"SERVICE":"NETWORK",serviceId:activeOrder?.id});
  }
  const t=i.text?.trim().toLowerCase();
  if(t==="iniciar turno")startShift(d.id);
  if(t==="encerrar turno")endShift(d.id);
  if(t==="descansar")enforceRest(d.id);
  const correlatedOrder=[...orders.values()].find(x=>x.assignedDriverId===d.id&&!["COMPLETED","CANCELLED"].includes(x.status));
  if(correlatedOrder)observeInbound(correlatedOrder.id,"DRIVER",d.id,d.phone,{messageId:i.id,correlationId});
  const offer=[...orders.values()].find(x=>x.assignedDriverId===d.id&&x.status==="OFFERED");
  if(offer&&["aceitar","aceito","aceitar entrega"].includes(t))acceptDispatch(offer.id,d.id);
  if(offer&&["recusar","recuso","recusar entrega"].includes(t))rejectDispatch(offer.id,d.id);
  const active=[...orders.values()].find(x=>x.assignedDriverId===d.id&&!["COMPLETED","CANCELLED","OFFERED"].includes(x.status));
  if(active&&["coletado","coleta confirmada"].includes(t))transitionDelivery(active.id,"PICKED_UP",d.id);
  if(active&&["em trânsito","em transito","saiu"].includes(t))transitionDelivery(active.id,"IN_TRANSIT",d.id);
  if(active&&["cheguei","cheguei no destino","cheguei ao destino"].includes(t))transitionDelivery(active.id,"ARRIVED",d.id);
  const code=i.text?.match(/\b\d{6}\b/)?.[0],o=[...orders.values()].find(x=>x.assignedDriverId===d.id&&x.status==="AWAITING_CONFIRMATION");
  if(code&&o&&completeOrder(o.id,code))await sendTwinMessage(o.id,"DRIVER","Entrega confirmada e concluída.");
  if(i.mediaUrl??i.mediaId){
   const p=[...orders.values()].find(x=>x.assignedDriverId===d.id&&x.status==="ASSIGNED");
   if(p){p.photoUrl=i.mediaUrl??i.mediaId;transitionDelivery(p.id,"PICKED_UP",d.id)}
  }
  changed();
  return;
 }
 const company=[...companies.values()].find(x=>x.phone===i.from);
 if(company){
  const companyOrder=[...orders.values()].reverse().find(x=>x.companyId===company.id&&!["COMPLETED","CANCELLED"].includes(x.status));
  if(companyOrder)observeInbound(companyOrder.id,"CUSTOMER",company.id,company.phone,{messageId:i.id,correlationId});
  if(i.mediaUrl??i.mediaId)transaction(()=>{
   const o=[...orders.values()].reverse().find(x=>x.companyId===company.id&&!x.photoUrl&&x.status!=="COMPLETED");
   if(o){o.photoUrl=i.mediaUrl??i.mediaId;emitDomainEvent({type:"PickupPhotoReceived",aggregateType:"order",aggregateId:o.id,payload:{serviceId:o.id,companyId:company.id,photoReceived:true,mediaId:i.mediaId},projections:[orderView(o)]})}
  });
  changed();
  return;
 }
 const o=[...orders.values()].find(x=>x.customerPhone===i.from&&["AWAITING_PAYMENT","SEARCHING_DRIVER","OFFERED","ASSIGNED","PICKED_UP","IN_TRANSIT","ARRIVED","AWAITING_CONFIRMATION"].includes(x.status));
 if(o)observeInbound(o.id,"CUSTOMER",o.customerPhone,o.customerPhone,{messageId:i.id,correlationId});
 if(o&&i.location)transaction(()=>{o.destination=i.location;emitDomainEvent({type:"LocationShared",aggregateType:"order",aggregateId:o.id,payload:{actor:"customer",serviceId:o.id,correlationId},projections:[orderView(o)]})});
 changed();
}

app.post("/api/whatsapp/webhook",async(req,res)=>{
 const rawBody=(req as express.Request & {rawBody?:Buffer}).rawBody?.toString("utf8")??JSON.stringify(req.body);
 if(whatsappMode==="official"){
  if(!verifyOfficialWebhook(rawBody,req.header("x-hub-signature-256"),process.env.WHATSAPP_APP_SECRET))return res.status(401).json({error:"assinatura WhatsApp inválida"});
 }
 const messages=parseIncomingMany(req.body);
 for(const message of messages){
  const messageId=message.id;
  const correlationId=messageId??crypto.randomUUID();
  if(messageId){
   const payloadHash=crypto.createHash("sha256").update(rawBody).digest("hex");
   if(!claimChannelMessage({channel:"whatsapp",messageId,payloadHash,receivedAt:new Date().toISOString()}))continue;
  }
  await handleIncomingWhatsApp(message,correlationId);
 }
 res.status(200).json({ok:true,processed:messages.length,duplicateSafe:true});
});

app.post("/api/orders",async(req,res)=>{try{res.status(201).json(await createOrder(req.body))}catch(e){res.status(400).json({error:e instanceof Error?e.message:"erro"})}});
app.get("/api/orders/:id/payment",(req,res)=>{const o=orders.get(req.params.id),p=o?.paymentId?payments.get(o.paymentId):undefined;if(!p)return res.status(404).json({error:"cobrança não encontrada"});res.json(p)});
app.get("/api/services/:id/audit",(req,res)=>res.json({serviceId:req.params.id,timeline:serviceAuditTimeline(req.params.id)}));
app.get("/api/services/:id/twins",(req,res)=>{const context=twinContext(req.params.id);if(!context)return res.status(404).json({error:"serviço não encontrado"});res.json({context,customerTwin:twinForService(req.params.id,"CUSTOMER"),driverTwin:twinForService(req.params.id,"DRIVER")})});
app.get("/api/providers",(req,res)=>{const city=typeof req.query.city==="string"?req.query.city:undefined;res.json(listProviders(city))});
app.post("/api/providers",(req,res)=>{try{res.status(201).json(registerProvider(req.body))}catch(e){res.status(409).json({error:e instanceof Error?e.message:"erro"})}});
app.put("/api/providers/:id/enabled",(req,res)=>{try{res.json(setProviderEnabled(req.params.id,Boolean(req.body.enabled)))}catch(e){res.status(404).json({error:e instanceof Error?e.message:"erro"})}});
app.get("/api/capacity",(req,res)=>{const city=typeof req.query.city==="string"?req.query.city:undefined;if(city)return res.json(capacityCities().find(x=>x.city===city)??{city,eligibleDrivers:0,committedReservations:0,availableCapacity:0});res.json(capacityCities())});
app.get("/api/payments/:id/settlement",(req,res)=>{
 const p=payments.get(req.params.id);
 if(!p)return res.status(404).json({error:"cobrança não encontrada"});
 const totals=ledgerTotals(p.id);
 const expected=Math.round(p.price*100);
 const reconciled=totals.providerCents+totals.platformFeeCents===expected;
 res.json({paymentId:p.id,orderId:p.orderId,customerTotalCents:expected,providerCents:totals.providerCents,platformFeeCents:totals.platformFeeCents,reconciled,entries:readLedger(p.id)});
});
app.get("/pagamento/:id",(req,res)=>{const o=orders.get(req.params.id),p=o?.paymentId?payments.get(o.paymentId):undefined;if(!p)return res.status(404).send("Cobrança não encontrada");const expires=Date.parse(p.expiresAt);res.type("html").send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagamento · motoboys.delivery</title><style>body{margin:0;background:#090909;color:#f4f4f4;font:16px system-ui;display:grid;place-items:center;min-height:100vh}.box{width:min(440px,90vw);background:#111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;text-align:center}img{width:260px;max-width:100%;background:#fff;padding:10px;border-radius:10px}code{display:block;background:#181818;padding:12px;border-radius:9px;word-break:break-all;text-align:left;color:#ffd400}b{font-size:28px;color:#ffd400}small{color:#999}</style><div class="box"><h1>Pagamento da entrega</h1><p>Valor</p><b>R$ ${p.price.toFixed(2).replace(".",",")}</b><p><img src="${p.qrCodeDataUrl}" alt="QR Code Pix"></p><p>Pix copia-e-cola</p><code>${p.pixCopyPaste}</code><p>Tempo restante: <b id="timer"></b></p><small>Após o vencimento, enviaremos uma mensagem perguntando se você ainda deseja o serviço.</small></div><script>const e=${expires};setInterval(()=>{const s=Math.max(0,Math.ceil((e-Date.now())/1000));document.querySelector("#timer").textContent=Math.floor(s/60)+":"+String(s%60).padStart(2,"0")},250)</script></html>`)});
app.post("/api/payments/webhook",async(req,res)=>{
 const rawBody=(req as express.Request & {rawBody?:Buffer}).rawBody?.toString("utf8")??JSON.stringify(req.body);
 const signature=String(req.header("x-financial-signature")??req.header("x-webhook-signature")??"");
 const idempotencyKey=String(req.header("idempotency-key")??"");
 const secret=process.env.FINANCIAL_WEBHOOK_SECRET??"";
 if(!secret)return res.status(503).json({error:"FINANCIAL_WEBHOOK_SECRET não configurado"});
 if(!idempotencyKey)return res.status(400).json({error:"Idempotency-Key é obrigatório"});
 if(!verifyPaymentWebhookSignature(rawBody,signature,secret))return res.status(401).json({error:"assinatura financeira inválida"});
 const id=String(req.body.paymentId??req.body.id??"");
 if(!id)return res.status(400).json({error:"paymentId é obrigatório"});
 try{
  const payment=payments.get(id);
  if(!payment)return res.status(404).json({error:"cobrança não encontrada"});
  const payloadHash=crypto.createHash("sha256").update(rawBody).digest("hex");
  const settled=settlePayment(payment,idempotencyKey,payloadHash);
  const order=await onPaymentConfirmed(payment.id);
  return res.json({ok:true,alreadyProcessed:settled.alreadyProcessed,order,ledger:settled.ledger});
 }catch(e){
  return res.status(409).json({error:e instanceof Error?e.message:"erro financeiro"});
 }
});

app.post("/api/drivers/:id/location",(req,res)=>{const d=drivers.get(req.params.id);if(!d)return res.status(404).json({error:"motoboy não encontrado"});try{const purpose=req.body.serviceId?"ACTIVE_SERVICE":(d.status==="AVAILABLE"?"WORK_START":"ACTIVE_SERVICE");const scope=req.body.serviceId?"SERVICE":"NETWORK";const updated=shareDriverLocation(d.id,{lat:Number(req.body.lat),lng:Number(req.body.lng)},{purpose,scope,serviceId:req.body.serviceId}).driver;retryInsufficientCapacity(updated.city);res.json(updated)}catch(e){res.status(400).json({error:e instanceof Error?e.message:"erro"})}});
app.post("/api/drivers/:id/shift/start",(req,res)=>{try{const shift=startShift(req.params.id,Number(req.body.seconds)||undefined);retryInsufficientCapacity(drivers.get(req.params.id)?.city);res.json(shift)}catch(e){res.status(400).json({error:e instanceof Error?e.message:"erro"})}});
app.post("/api/drivers/:id/shift/end",(req,res)=>{endShift(req.params.id);endDriverLocation(req.params.id);res.json({ok:true})});
app.post("/api/drivers/:id/rest",(req,res)=>res.json({until:enforceRest(req.params.id)}));
app.get("/api/drivers/:id/work-policy",(req,res)=>{if(!drivers.get(req.params.id))return res.status(404).json({error:"motoboy não encontrado"});res.json(getWorkPolicy(req.params.id))});
app.put("/api/drivers/:id/work-policy",(req,res)=>{try{if(!drivers.get(req.params.id))return res.status(404).json({error:"motoboy não encontrado"});res.json(setWorkPolicy(req.params.id,req.body))}catch(e){res.status(400).json({error:e instanceof Error?e.message:"erro"})}});
app.post("/api/orders/:id/dispatch/accept",(req,res)=>{try{const driverId=String(req.body.driverId??"");if(!driverId)return res.status(400).json({error:"driverId é obrigatório"});res.json(acceptDispatch(req.params.id,driverId))}catch(e){res.status(409).json({error:e instanceof Error?e.message:"erro"})}});
app.post("/api/orders/:id/dispatch/reject",(req,res)=>{try{const driverId=String(req.body.driverId??"");if(!driverId)return res.status(400).json({error:"driverId é obrigatório"});res.json(rejectDispatch(req.params.id,driverId))}catch(e){res.status(409).json({error:e instanceof Error?e.message:"erro"})}});
app.post("/api/orders/:id/status",(req,res)=>{try{const next=String(req.body.status) as any;const driverId=req.body.driverId?String(req.body.driverId):undefined;res.json(transitionDelivery(req.params.id,next,driverId))}catch(e){res.status(409).json({error:e instanceof Error?e.message:"erro"})}});
app.post("/api/orders/:id/confirm",async(req,res)=>{
 try{
  const current=requestDeliveryConfirmation(req.params.id);
  await sendTwinMessage(current.id,"CUSTOMER",`Código de confirmação da entrega: ${current.confirmationCode}`);
  res.json({ok:true});
 }catch(e){res.status(409).json({error:e instanceof Error?e.message:"erro"})}
});

app.get("/api/distance",(req,res)=>{const a:LatLng={lat:Number(req.query.lat1),lng:Number(req.query.lng1)},b:LatLng={lat:Number(req.query.lat2),lng:Number(req.query.lng2)};res.json({km:distanceKm(a,b)})});
app.get("/{*splat}",(_q,res)=>res.sendFile(path.resolve(__dirname,"../public/index.html")));

const port=Number(process.env.PORT??60060);
const dispatchExpiryTimer=setInterval(()=>expireDispatchOffers(),1000);(dispatchExpiryTimer as NodeJS.Timeout).unref?.();
app.listen(port,()=>console.log(`motoboys.delivery PoC em http://localhost:${port}`));
