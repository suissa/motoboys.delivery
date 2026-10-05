import {spawn} from "node:child_process";
import assert from "node:assert/strict";
import {paymentWebhookSignature} from "../src/services/finance.js";

const port=Number(process.env.SIMULATION_PORT??60160);
const secret="dev-secret";
const child=spawn(process.execPath,["--import","tsx","src/server.ts"],{env:{...process.env,PORT:String(port),PUBLIC_BASE_URL:`http://127.0.0.1:${port}`,FINANCIAL_API:"http://127.0.0.1:9",PIX_EXPIRATION_SECONDS:"60",FINANCIAL_WEBHOOK_SECRET:secret},stdio:["ignore","pipe","pipe"]});
let output="";
child.stdout.on("data",b=>output+=b.toString());
child.stderr.on("data",b=>output+=b.toString());
try{
 for(let i=0;i<50;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/state`)).ok)break}catch{await new Promise(r=>setTimeout(r,100))}}
 const state=await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
 assert.equal(state.companies[0].id,"company-demo");
 const distance=await (await fetch(`http://127.0.0.1:${port}/api/distance?lat1=-24.112&lng1=-49.334&lat2=-24.115&lng2=-49.330`)).json();
 assert(distance.km>0);
 const config=await (await fetch(`http://127.0.0.1:${port}/api/config/layout`)).json();
 assert.equal(config.theme.primary,"#ffd400");
 await fetch(`http://127.0.0.1:${port}/api/drivers/moto-01/shift/start`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({seconds:300})});
 await fetch(`http://127.0.0.1:${port}/api/drivers/moto-01/location`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({lat:-24.112,lng:-49.334})});
 const created=await (await fetch(`http://127.0.0.1:${port}/api/orders`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId:"company-demo",customerPhone:"5515999992000",pickup:{lat:-24.112,lng:-49.334},destination:{lat:-24.115,lng:-49.330},price:12.5})})).json();
 assert.equal(created.order.status,"AWAITING_PAYMENT");
 const paymentBody=JSON.stringify({paymentId:created.payment.id});
 const paymentHeaders={"content-type":"application/json","x-financial-signature":paymentWebhookSignature(paymentBody,secret),"idempotency-key":"simulation-"+created.payment.id};
 const firstPayment=await fetch(`http://127.0.0.1:${port}/api/payments/webhook`,{method:"POST",headers:paymentHeaders,body:paymentBody});
 const firstResult=await firstPayment.json();
 assert.equal(firstPayment.status,200);
 assert.equal(firstResult.ledger.length,2);
 const settlement=await (await fetch(`http://127.0.0.1:${port}/api/payments/${created.payment.id}/settlement`)).json();
 assert.equal(settlement.reconciled,true);
 const repeated=await fetch(`http://127.0.0.1:${port}/api/payments/webhook`,{method:"POST",headers:paymentHeaders,body:paymentBody});
 const repeatedResult=await repeated.json();
 assert.equal(repeated.status,200);
 assert.equal(repeatedResult.alreadyProcessed,true);
 const invalid=await fetch(`http://127.0.0.1:${port}/api/payments/webhook`,{method:"POST",headers:{"content-type":"application/json","x-financial-signature":"sha256=invalid","idempotency-key":"invalid-"+created.payment.id},body:paymentBody});
 assert.equal(invalid.status,401);
 const assigned=await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
 const assignedOrder=assigned.orders.find((x:any)=>x.id===created.order.id);
 assert.equal(assignedOrder.status,"OFFERED");
 const driverId=assignedOrder.assignedDriverId;
 const accepted=await fetch(`http://127.0.0.1:${port}/api/orders/${created.order.id}/dispatch/accept`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({driverId})});
 assert.equal(accepted.status,200);
 for(const status of ["PICKED_UP","IN_TRANSIT","ARRIVED"]){const r=await fetch(`http://127.0.0.1:${port}/api/orders/${created.order.id}/status`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status,driverId})});assert.equal(r.status,200)}
 await fetch(`http://127.0.0.1:${port}/api/orders/${created.order.id}/confirm`,{method:"POST"});
 const awaiting=await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
 const confirmation=awaiting.orders.find((x:any)=>x.id===created.order.id).confirmationCode;
 assert.match(confirmation,/^\d{6}$/);
 await fetch(`http://127.0.0.1:${port}/api/whatsapp/webhook`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:{from:"5515999990001",text:confirmation}})});
 const completed=await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
 assert.equal(completed.orders.find((x:any)=>x.id===created.order.id).status,"COMPLETED");
 console.log(JSON.stringify({simulation:"api",stateDrivers:state.drivers.length,distanceKm:Number(distance.km.toFixed(3)),themePrimary:config.theme.primary,orderId:created.order.id,ledgerEntries:firstResult.ledger.length,reconciled:settlement.reconciled,repeatedWebhook:true,invalidSignatureRejected:true,finalStatus:"COMPLETED"},null,2));
}finally{
 child.kill();
 if(output.trim())console.error(output.trim());
}
