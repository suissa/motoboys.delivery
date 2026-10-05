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
`);

type DirtyState={collection:string;id:string;operation:"SET"|"UPDATE"|"DELETE";state:string|null};
let transactionDepth=0;
let transactionId:string|undefined;
let dirty=new Map<string,DirtyState>();

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
    database.exec("DELETE FROM sqlite_sequence WHERE name='state_history'");
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
