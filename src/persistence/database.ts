import {DatabaseSync} from "node:sqlite";
import {mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import crypto from "node:crypto";

const configuredPath=process.env.MOTOBOYS_DB_FILE;
const dbPath=configuredPath===":memory:"?":memory:":resolve(configuredPath??resolve("data","motoboys.sqlite"));
if(dbPath!==":memory:")mkdirSync(dirname(dbPath),{recursive:true});

export const database=new DatabaseSync(dbPath,{timeout:5000});
database.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA synchronous=FULL;
  PRAGMA foreign_keys=ON;

  CREATE TABLE IF NOT EXISTS entities(
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    state_json TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(collection,id)
  ) WITHOUT ROWID;

  CREATE TABLE IF NOT EXISTS state_history(
    revision INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT NOT NULL,
    collection TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    state_json TEXT,
    recorded_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_state_history_entity
    ON state_history(collection,entity_id,revision);

  CREATE TABLE IF NOT EXISTS domain_events(
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    transaction_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    occurred_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_domain_events_aggregate
    ON domain_events(aggregate_type,aggregate_id,sequence);

  CREATE TABLE IF NOT EXISTS domain_event_projections(
    event_id TEXT NOT NULL,
    projection_name TEXT NOT NULL,
    collection TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    state_json TEXT,
    PRIMARY KEY(event_id,projection_name,collection,entity_id),
    FOREIGN KEY(event_id) REFERENCES domain_events(event_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS financial_webhook_receipts(
    idempotency_key TEXT PRIMARY KEY,
    payload_hash TEXT NOT NULL,
    payment_id TEXT NOT NULL,
    processed_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_financial_webhook_payment
    ON financial_webhook_receipts(payment_id);

  CREATE TABLE IF NOT EXISTS settlement_ledger(
    entry_id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    entry_type TEXT NOT NULL,
    beneficiary_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(payment_id,entry_type)
  );

  CREATE INDEX IF NOT EXISTS idx_settlement_ledger_payment
    ON settlement_ledger(payment_id);

  CREATE TABLE IF NOT EXISTS projections(
    projection_name TEXT NOT NULL,
    collection TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    state_json TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(projection_name,collection,entity_id)
  ) WITHOUT ROWID;
`);

type DirtyState={collection:string;id:string;operation:"SET"|"UPDATE"|"DELETE";state:string|null};
let transactionDepth=0;
let transactionId:string|undefined;
let dirty=new Map<string,DirtyState>();

export function inTransaction(){return transactionDepth>0}
export function currentTransactionId(){return transactionId}
export function transaction<T>(work:()=>T):T{
  const outer=transactionDepth===0;
  if(outer){
    database.exec("BEGIN IMMEDIATE");
    transactionId=crypto.randomUUID();
    dirty=new Map();
  }
  transactionDepth++;
  try{
    const value=work();
    transactionDepth--;
    if(outer){
      const now=new Date().toISOString();
      const insert=database.prepare("INSERT INTO state_history(transaction_id,collection,entity_id,operation,state_json,recorded_at) VALUES(?,?,?,?,?,?)");
      for(const item of dirty.values())insert.run(transactionId,item.collection,item.id,item.operation,item.state,now);
      insert.close();
      database.exec("COMMIT");
      transactionId=undefined;
      dirty=new Map();
    }
    return value;
  }catch(error){
    transactionDepth--;
    if(outer){
      try{database.exec("ROLLBACK")}finally{transactionId=undefined;dirty=new Map();}
    }
    throw error;
  }
}

function key(collection:string,id:string){return collection+"\0"+id}
function markDirty(collection:string,id:string,operation:DirtyState["operation"],state:string|null){
  dirty.set(key(collection,id),{collection,id,operation,state});
}

function parseState(row:{state_json:string}|undefined){
  return row?JSON.parse(row.state_json) as Record<string,unknown>:undefined;
}

export function readEntity(collection:string,id:string):Record<string,unknown>|undefined{
  const row=database.prepare("SELECT state_json FROM entities WHERE collection=? AND id=?").get(collection,id) as {state_json:string}|undefined;
  return parseState(row);
}

export function readEntities(collection:string):Array<Record<string,unknown>>{
  const rows=database.prepare("SELECT state_json FROM entities WHERE collection=? ORDER BY id").all(collection) as Array<{state_json:string}>;
  return rows.map(x=>JSON.parse(x.state_json) as Record<string,unknown>);
}

export function readEntityIds(collection:string):string[]{
  const rows=database.prepare("SELECT id FROM entities WHERE collection=? ORDER BY id").all(collection) as Array<{id:string}>;
  return rows.map(x=>x.id);
}

export function entityExists(collection:string,id:string){return !!database.prepare("SELECT 1 AS found FROM entities WHERE collection=? AND id=?").get(collection,id)}

export function setEntity(collection:string,id:string,state:Record<string,unknown>){
  transaction(()=>{
    const now=new Date().toISOString();
    const json=JSON.stringify(state);
    database.prepare(`
      INSERT INTO entities(collection,id,state_json,version,updated_at)
      VALUES(?,?,?,1,?)
      ON CONFLICT(collection,id) DO UPDATE SET
        state_json=excluded.state_json,
        version=entities.version+1,
        updated_at=excluded.updated_at
    `).run(collection,id,json,now);
    markDirty(collection,id,"SET",json);
  });
}

export function updateEntityProperty(collection:string,id:string,property:string,value:unknown){
  transaction(()=>{
    const row=database.prepare("SELECT state_json FROM entities WHERE collection=? AND id=?").get(collection,id) as {state_json:string}|undefined;
    if(!row)throw Error(`Entidade não encontrada: ${collection}/${id}`);
    const state=JSON.parse(row.state_json) as Record<string,unknown>;
    if(value===undefined)delete state[property]; else state[property]=value;
    const json=JSON.stringify(state);
    database.prepare("UPDATE entities SET state_json=?,version=version+1,updated_at=? WHERE collection=? AND id=?")
      .run(json,new Date().toISOString(),collection,id);
    markDirty(collection,id,"UPDATE",json);
  });
}

export function deleteEntity(collection:string,id:string){
  transaction(()=>{
    const exists=entityExists(collection,id);
    if(!exists)return;
    database.prepare("DELETE FROM entities WHERE collection=? AND id=?").run(collection,id);
    markDirty(collection,id,"DELETE",null);
  });
}

export function clearCollection(collection:string){
  transaction(()=>{
    const ids=readEntityIds(collection);
    database.prepare("DELETE FROM entities WHERE collection=?").run(collection);
    for(const id of ids)markDirty(collection,id,"DELETE",null);
  });
}

export type SettlementLedgerEntry={
  entry_id:string;
  payment_id:string;
  order_id:string;
  entry_type:"PROVIDER_CREDIT"|"PLATFORM_FEE";
  beneficiary_id:string;
  amount_cents:number;
  currency:string;
  idempotency_key:string;
  created_at:string;
};

export function getFinancialWebhookReceipt(idempotencyKey:string){
  return database.prepare("SELECT idempotency_key,payload_hash,payment_id,processed_at FROM financial_webhook_receipts WHERE idempotency_key=?")
    .get(idempotencyKey) as {idempotency_key:string;payload_hash:string;payment_id:string;processed_at:string}|undefined;
}

export function saveFinancialWebhookReceipt(input:{idempotencyKey:string;payloadHash:string;paymentId:string;processedAt:string}){
  database.prepare("INSERT INTO financial_webhook_receipts(idempotency_key,payload_hash,payment_id,processed_at) VALUES(?,?,?,?)")
    .run(input.idempotencyKey,input.payloadHash,input.paymentId,input.processedAt);
}

export function saveLedgerEntry(entry:SettlementLedgerEntry){
  database.prepare("INSERT INTO settlement_ledger(entry_id,payment_id,order_id,entry_type,beneficiary_id,amount_cents,currency,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(payment_id,entry_type) DO NOTHING")
    .run(entry.entry_id,entry.payment_id,entry.order_id,entry.entry_type,entry.beneficiary_id,entry.amount_cents,entry.currency,entry.idempotency_key,entry.created_at);
}

export function readLedger(paymentId?:string){
  if(paymentId)return database.prepare("SELECT entry_id,payment_id,order_id,entry_type,beneficiary_id,amount_cents,currency,idempotency_key,created_at FROM settlement_ledger WHERE payment_id=? ORDER BY entry_type").all(paymentId) as SettlementLedgerEntry[];
  return database.prepare("SELECT entry_id,payment_id,order_id,entry_type,beneficiary_id,amount_cents,currency,idempotency_key,created_at FROM settlement_ledger ORDER BY created_at").all() as SettlementLedgerEntry[];
}

export function ledgerTotals(paymentId:string){
  const rows=readLedger(paymentId);
  return{
    providerCents:rows.filter(x=>x.entry_type==="PROVIDER_CREDIT").reduce((sum,x)=>sum+x.amount_cents,0),
    platformFeeCents:rows.filter(x=>x.entry_type==="PLATFORM_FEE").reduce((sum,x)=>sum+x.amount_cents,0),
    count:rows.length
  };
}

export type StoredDomainEvent={
  sequence:number;
  event_id:string;
  transaction_id:string;
  event_type:string;
  aggregate_type:string;
  aggregate_id:string;
  payload_json:string;
  occurred_at:string;
};

export type ProjectionUpdate={
  projectionName:string;
  collection:string;
  entityId:string;
  state:Record<string,unknown>|null;
};

export function appendStoredEvent(event:{
  eventId:string;
  eventType:string;
  aggregateType:string;
  aggregateId:string;
  payload:Record<string,unknown>;
  occurredAt:string;
  projections:ProjectionUpdate[];
}){
  if(!inTransaction())throw Error("Eventos de domínio devem ser gravados dentro de uma transação");
  const tx=currentTransactionId();
  if(!tx)throw Error("Transação de domínio sem transactionId");
  database.prepare(`
    INSERT INTO domain_events(event_id,transaction_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at)
    VALUES(?,?,?,?,?,?,?)
  `).run(event.eventId,tx,event.eventType,event.aggregateType,event.aggregateId,JSON.stringify(event.payload),event.occurredAt);
  const insertProjection=database.prepare(`
    INSERT INTO domain_event_projections(event_id,projection_name,collection,entity_id,state_json)
    VALUES(?,?,?,?,?)
  `);
  for(const projection of event.projections){
    insertProjection.run(event.eventId,projection.projectionName,projection.collection,projection.entityId,projection.state===null?null:JSON.stringify(projection.state));
    applyProjection(projection);
  }
  insertProjection.close();
}

export function applyProjection(update:ProjectionUpdate){
  if(update.state===null){
    database.prepare("DELETE FROM projections WHERE projection_name=? AND collection=? AND entity_id=?")
      .run(update.projectionName,update.collection,update.entityId);
    return;
  }
  const json=JSON.stringify(update.state);
  database.prepare(`
    INSERT INTO projections(projection_name,collection,entity_id,state_json,version,updated_at)
    VALUES(?,?,?, ?,1,?)
    ON CONFLICT(projection_name,collection,entity_id) DO UPDATE SET
      state_json=excluded.state_json,
      version=projections.version+1,
      updated_at=excluded.updated_at
  `).run(update.projectionName,update.collection,update.entityId,json,new Date().toISOString());
}

export function readDomainEvents():StoredDomainEvent[]{
  return database.prepare("SELECT sequence,event_id,transaction_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at FROM domain_events ORDER BY sequence").all() as StoredDomainEvent[];
}

export function readEventProjections(eventId:string):ProjectionUpdate[]{
  const rows=database.prepare("SELECT projection_name,collection,entity_id,state_json FROM domain_event_projections WHERE event_id=?").all(eventId) as Array<{projection_name:string;collection:string;entity_id:string;state_json:string|null}>;
  return rows.map(row=>({
    projectionName:row.projection_name,
    collection:row.collection,
    entityId:row.entity_id,
    state:row.state_json===null?null:JSON.parse(row.state_json) as Record<string,unknown>
  }));
}

export function readProjection(projectionName:string,collection?:string){
  const rows=collection
    ? database.prepare("SELECT entity_id,state_json,version,updated_at FROM projections WHERE projection_name=? AND collection=? ORDER BY entity_id").all(projectionName,collection)
    : database.prepare("SELECT collection,entity_id,state_json,version,updated_at FROM projections WHERE projection_name=? ORDER BY collection,entity_id").all(projectionName);
  return rows.map((row:any)=>({...row,state:JSON.parse(row.state_json)}));
}

export function clearProjections(){
  database.exec("DELETE FROM projections");
}

export function history(collection?:string){
  if(collection){
    return database.prepare("SELECT revision,transaction_id,collection,entity_id,operation,state_json,recorded_at FROM state_history WHERE collection=? ORDER BY revision")
      .all(collection);
  }
  return database.prepare("SELECT revision,transaction_id,collection,entity_id,operation,state_json,recorded_at FROM state_history ORDER BY revision").all();
}

export function resetDatabase(seeds:Record<string,Record<string,unknown>[]>){
  transaction(()=>{
    database.exec("DELETE FROM entities");
    database.exec("DELETE FROM financial_webhook_receipts");
    database.exec("DELETE FROM settlement_ledger");
    database.exec("DELETE FROM domain_event_projections");
    database.exec("DELETE FROM domain_events");
    database.exec("DELETE FROM projections");
    database.exec("DELETE FROM sqlite_sequence WHERE name='state_history'");
    database.exec("DELETE FROM sqlite_sequence WHERE name='domain_event_projections'");
    database.exec("DELETE FROM sqlite_sequence WHERE name='domain_events'");
    database.exec("DELETE FROM state_history");
    for(const [collection,rows] of Object.entries(seeds)){
      for(const row of rows)setEntityInCurrentTransaction(collection,String(row.id),row);
    }
  });
}

function setEntityInCurrentTransaction(collection:string,id:string,state:Record<string,unknown>){
  const json=JSON.stringify(state);
  database.prepare(`
    INSERT INTO entities(collection,id,state_json,version,updated_at)
    VALUES(?,?,?,1,?)
  `).run(collection,id,json,new Date().toISOString());
  markDirty(collection,id,"SET",json);
}

export function freshEntity(collection:string,id:string){
  const state=readEntity(collection,id);
  return state;
}
