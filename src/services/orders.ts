import {drivers,orders,changed,transaction} from "../store.js";import type {LatLng,Order} from "../domain.js";import {chooseDriver} from "./queue.js";import {createPix,expirePayment} from "./payments.js";import {whatsapp} from "./whatsapp.js";
const base=process.env.PUBLIC_BASE_URL??`http://localhost:${process.env.PORT??60060}`,expiration=Number(process.env.PIX_EXPIRATION_SECONDS??900);

export async function createOrder(i:{companyId:string;customerPhone:string;pickup:LatLng;destination:LatLng;price:number;platformFee?:number}){
 const draft:Order={id:crypto.randomUUID(),companyId:i.companyId,customerPhone:i.customerPhone,pickup:i.pickup,destination:i.destination,price:i.price,platformFee:i.platformFee??2,status:"AWAITING_PAYMENT",createdAt:new Date().toISOString()};
 const p=await createPix(draft.id,draft.price+draft.platformFee);
 transaction(()=>orders.set(draft.id,{...draft,paymentId:p.id,paymentExpiresAt:p.expiresAt}));
 const order=orders.get(draft.id)!;
 await whatsapp.send({to:order.customerPhone,text:`Para confirmar a entrega, pague ${p.price.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}. Link: ${base}/pagamento/${order.id}`});
 const expirationTimer=setTimeout(async()=>{if(expirePayment(p.id)){await whatsapp.send({to:order.customerPhone,text:"O prazo para pagamento desta entrega terminou. Você ainda deseja este serviço?"})}},expiration*1000); (expirationTimer as NodeJS.Timeout).unref?.();
 changed();
 return{order,payment:p};
}

export async function onPaymentConfirmed(paymentId:string){
 let result:Order|undefined;
 let selected:{name:string;phone:string;location?:LatLng;etaMinutes:number}|undefined;
 let alreadyProcessed=false;
 transaction(()=>{
   const o=[...orders.values()].find(x=>x.paymentId===paymentId);
   if(!o)throw Error("Pedido não encontrado para a cobrança");
   if(o.status!=="AWAITING_PAYMENT"&&o.status!=="PAID"&&o.status!=="SEARCHING_DRIVER"){
     result=o;
     alreadyProcessed=true;
     return;
   }
   o.status="SEARCHING_DRIVER";
   o.paidAt=new Date().toISOString();
   const c=chooseDriver(o.pickup);
   if(c){
     c.driver.status="BUSY";
     c.driver.lastAssignedAt=new Date().toISOString();
     o.assignedDriverId=c.driver.id;
     o.assignedAt=c.driver.lastAssignedAt;
     o.status="ASSIGNED";
     selected={name:c.driver.name,phone:c.driver.phone,location:c.driver.location,etaMinutes:c.etaMinutes};
   }
   result=o;
 });
 if(!result)throw Error("Falha ao atualizar o pedido");
 if(alreadyProcessed)return result;
 if(selected){
   await whatsapp.send({to:result.customerPhone,text:`Pagamento confirmado. Motoboy ${selected.name} foi acionado.`});
   if(selected.location)await whatsapp.send({to:result.customerPhone,location:{...selected.location,title:`Motoboy ${selected.name}`,etaMinutes:selected.etaMinutes}});
 }else await whatsapp.send({to:result.customerPhone,text:"Pagamento confirmado. Estamos procurando um motoboy disponível na rede."});
 changed();
 return result;
}

export function completeOrder(id:string,code:string){
 let completed=false;
 transaction(()=>{
   const o=orders.get(id);
   if(!o||o.confirmationCode!==code||o.status!=="AWAITING_CONFIRMATION")return;
   o.status="COMPLETED";
   o.completedAt=new Date().toISOString();
   const d=o.assignedDriverId?drivers.get(o.assignedDriverId):undefined;
   if(d){
     d.status="AVAILABLE";
     d.completedToday++;
     d.deliveries++;
     d.earnedToday+=o.price;
   }
   completed=true;
 });
 if(completed)changed();
 return completed;
}
