import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs/promises";
import {fileURLToPath} from "node:url";
import YAML from "yaml";
import {companies,drivers,orders,payments,shifts,subscribe,changed,transaction} from "./store.js";
import {parseIncoming,whatsapp} from "./services/whatsapp.js";
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
import {shareDriverLocation,endDriverLocation,refreshLocationSessions} from "./services/location.js";
import {settlePayment,paymentWebhookSignature,verifyPaymentWebhookSignature} from "./services/finance.js";
import crypto from "node:crypto";
import {ledgerTotals,readLedger} from "./persistence/database.js";

ensureDomainEventBaseline();
rebuildOperationalProjections();

const app=express();
app.use(cors());
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
  metrics:metrics(),
  totals:{
   deliveredToday:os.filter(o=>o.status==="COMPLETED").length,
   receivedToday:os.filter(o=>o.status==="COMPLETED").reduce((s,o)=>s+o.price,0),
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

app.post("/api/whatsapp/webhook",async(req,res)=>{
 const i=parseIncoming(req.body);
 if(!i.from)return res.status(400).json({error:"from é obrigatório"});
 const d=[...drivers.values()].find(x=>x.phone===i.from);
 if(d){
  if(i.location)shareDriverLocation(d.id,i.location,{purpose:d.status==="AVAILABLE"?"WORK_START":"ACTIVE_SERVICE",scope:"SERVICE",serviceId:req.body.serviceId});
  const t=i.text?.trim().toLowerCase();
  if(t==="iniciar turno")startShift(d.id);
  if(t==="encerrar turno")endShift(d.id);
  if(t==="descansar")enforceRest(d.id);
  const code=i.text?.match(/\b\d{6}\b/)?.[0],o=[...orders.values()].find(x=>x.assignedDriverId===d.id&&x.status==="AWAITING_CONFIRMATION");
  if(code&&o&&completeOrder(o.id,code))await whatsapp.send({to:d.phone,text:"Entrega confirmada e concluída."});
  if(i.mediaUrl)transaction(()=>{
   const p=[...orders.values()].find(x=>x.assignedDriverId===d.id&&["ASSIGNED","PICKED_UP","IN_TRANSIT"].includes(x.status));
   if(p){p.photoUrl=i.mediaUrl;p.status="PICKED_UP";emitDomainEvent({type:"PickupConfirmed",aggregateType:"order",aggregateId:p.id,payload:{serviceId:p.id,driverId:d.id,photoReceived:true},projections:[orderView(p),driverView(d)]})}
  });
  changed();
  return res.json({ok:true,actor:"driver"});
 }
 const c=[...companies.values()].find(x=>x.phone===i.from);
 if(c){
  if(i.mediaUrl)transaction(()=>{
   const o=[...orders.values()].reverse().find(x=>x.companyId===c.id&&!x.photoUrl&&x.status!=="COMPLETED");
   if(o){o.photoUrl=i.mediaUrl;emitDomainEvent({type:"PickupPhotoReceived",aggregateType:"order",aggregateId:o.id,payload:{serviceId:o.id,companyId:c.id,photoReceived:true},projections:[orderView(o)]})}
  });
  changed();
  return res.json({ok:true,actor:"company"});
 }
 const o=[...orders.values()].find(x=>x.customerPhone===i.from&&["ASSIGNED","PICKED_UP","IN_TRANSIT"].includes(x.status));
 if(o&&i.location)transaction(()=>{o.destination=i.location!;emitDomainEvent({type:"LocationShared",aggregateType:"order",aggregateId:o.id,payload:{actor:"customer",serviceId:o.id},projections:[orderView(o)]})});
 changed();
 res.json({ok:true,actor:"customer"});
});

app.post("/api/orders",async(req,res)=>{try{res.status(201).json(await createOrder(req.body))}catch(e){res.status(400).json({error:e instanceof Error?e.message:"erro"})}});
app.get("/api/orders/:id/payment",(req,res)=>{const o=orders.get(req.params.id),p=o?.paymentId?payments.get(o.paymentId):undefined;if(!p)return res.status(404).json({error:"cobrança não encontrada"});res.json(p)});
app.get("/api/payments/:id/settlement",(req,res)=>{
 const p=payments.get(req.params.id);
 if(!p)return res.status(404).json({error:"cobrança não encontrada"});
 const totals=ledgerTotals(p.id);
 const expected=Math.round(p.price*100);
 const reconciled=totals.providerCents+totals.platformFeeCents===expected;
 res.json({paymentId:p.id,orderId:p.orderId,customerTotalCents:expected,providerCents:totals.providerCents,platformFeeCents:totals.platformFeeCents,reconciled,entries:readLedger(p.id)});
});
app.get("/pagamento/:id",(req,res)=>{const o=orders.get(req.params.id),p=o?.paymentId?payments.get(o.paymentId):undefined;if(!p)return res.status(404).send("Cobrança não encontrada");const expires=Date.parse(p.expiresAt);res.type("html").send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagamento · motoboys.delivery</title><style>body{margin:0;background:#090909;color:#f4f4f4;font:16px system-ui;display:grid;place-items:center;min-height:100vh}.box{width:min(440px,90vw);background:#111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;text-align:center}img{width:260px;max-width:100%;background:#fff;padding:10px;border-radius:10px}code{display:block;background:#181818;padding:12px;border-radius:9px;word-break:break-all;text-align:left;color:#ffd400}b{font-size:28px;color:#ffd400}small{color:#999}</style><div class="box"><h1>Pagamento da entrega</h1><p>Valor</p><b>R$ ${p.price.toFixed(2).replace(".",",")}</b><p><img src="${p.qrCodeDataUrl}" alt="QR Code Pix"></p><p>Pix copia-e-cola</p><code>${p.pixCopyPaste}</code><p>Tempo restante: <b id="timer"></b></p><small>Após o vencimento, enviaremos uma mensagem perguntando se você ainda deseja o serviço.</small></div><script>const e=${expires};setInterval(()=>{const s=Math.max(0,Math.ceil((e-Date.now())/1000));document.querySelector("#timer").textContent=Math.floor(s/60)+":"+String(s%60).padStart(2,"0")},250)</script></html>`)});
app.post("/api/payments/webhook",async(req,res)=>{const id=req.body.paymentId??req.body.id;if(!id)return res.status(400).json({error:"paymentId é obrigatório"});confirmPayment(id);res.json({ok:true,order:await onPaymentConfirmed(id)})});

app.post("/api/drivers/:id/location",(req,res)=>{const d=drivers.get(req.params.id);if(!d)return res.status(404).json({error:"motoboy não encontrado"});try{const purpose=req.body.serviceId?"ACTIVE_SERVICE":(d.status==="AVAILABLE"?"WORK_START":"ACTIVE_SERVICE");const scope=req.body.serviceId?"SERVICE":"NETWORK";res.json(shareDriverLocation(d.id,{lat:Number(req.body.lat),lng:Number(req.body.lng)},{purpose,scope,serviceId:req.body.serviceId}).driver)}catch(e){res.status(400).json({error:e instanceof Error?e.message:"erro"})}});
app.post("/api/drivers/:id/shift/start",(req,res)=>{try{res.json(startShift(req.params.id,Number(req.body.seconds)||undefined))}catch(e){res.status(400).json({error:e instanceof Error?e.message:"erro"})}});
app.post("/api/drivers/:id/shift/end",(req,res)=>{endShift(req.params.id);endDriverLocation(req.params.id);res.json({ok:true})});
app.post("/api/drivers/:id/rest",(req,res)=>res.json({until:enforceRest(req.params.id)}));
app.get("/api/drivers/:id/work-policy",(req,res)=>{if(!drivers.get(req.params.id))return res.status(404).json({error:"motoboy não encontrado"});res.json(getWorkPolicy(req.params.id))});
app.put("/api/drivers/:id/work-policy",(req,res)=>{try{if(!drivers.get(req.params.id))return res.status(404).json({error:"motoboy não encontrado"});res.json(setWorkPolicy(req.params.id,req.body))}catch(e){res.status(400).json({error:e instanceof Error?e.message:"erro"})}});
app.post("/api/orders/:id/confirm",async(req,res)=>{
 const o=orders.get(req.params.id);if(!o)return res.status(404).json({error:"pedido não encontrado"});
 transaction(()=>{const current=orders.get(req.params.id);if(!current)throw Error("pedido não encontrado");const code=String(Math.floor(1e5+Math.random()*9e5));current.confirmationCode=code;current.status="AWAITING_CONFIRMATION";emitDomainEvent({type:"ConfirmationRequested",aggregateType:"order",aggregateId:current.id,payload:{serviceId:current.id},projections:[orderView(current)]})});
 const current=orders.get(req.params.id)!;await whatsapp.send({to:current.customerPhone,text:`Código de confirmação da entrega: ${current.confirmationCode}`});changed();res.json({ok:true});
});
app.get("/api/distance",(req,res)=>{const a:LatLng={lat:Number(req.query.lat1),lng:Number(req.query.lng1)},b:LatLng={lat:Number(req.query.lat2),lng:Number(req.query.lng2)};res.json({km:distanceKm(a,b)})});
app.get("/{*splat}",(_q,res)=>res.sendFile(path.resolve(__dirname,"../public/index.html")));

const port=Number(process.env.PORT??60060);
app.listen(port,()=>console.log(`motoboys.delivery PoC em http://localhost:${port}`));
