import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,lstatSync,existsSync} from 'node:fs';
import {dirname,resolve,parse,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
export const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(stable(value))).digest('hex');
export const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
export const check=(ok,message,code='COOP_INPUT_INVALID')=>{if(!ok)fail(code,message);};
export const id=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
export const nodeId=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function safeLocal(path){const absolute=resolve(path);let at=parse(absolute).root;for(const part of absolute.slice(at.length).split(/[\\/]/)){at=join(at,part);if(existsSync(at))check(!lstatSync(at).isSymbolicLink(),'数据路径不能包含符号链接。','COOP_PATH_INVALID');}return absolute;}
export function openStore(directory,owner){
  safeLocal(directory);mkdirSync(directory,{recursive:true,mode:0o700});const path=safeLocal(join(directory,'cooperation.sqlite'));
  const db=new DatabaseSync(path);db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const version=db.prepare('PRAGMA user_version').get().user_version;check(version<=2,'数据库来自更高版本，保留原件。','COOP_DATA_NEWER');
  if(version===1&&!existsSync(path+'.v1-backup'))db.exec("VACUUM INTO '"+safeLocal(path+'.v1-backup').replaceAll("'","''")+"'");
  db.exec(`CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,updated TEXT NOT NULL,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,digest TEXT NOT NULL,result TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,peer TEXT NOT NULL,seq INTEGER NOT NULL,direction TEXT NOT NULL,applied INTEGER NOT NULL DEFAULT 0,body TEXT NOT NULL,UNIQUE(peer,seq,direction));
    CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY REFERENCES events(id),peer TEXT NOT NULL,state TEXT NOT NULL,attempt TEXT,transport TEXT,attempts INTEGER NOT NULL DEFAULT 0,error TEXT,updated TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS artifacts(digest TEXT PRIMARY KEY,name TEXT NOT NULL,size INTEGER NOT NULL,mediaType TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,taskId TEXT NOT NULL,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS callbacks(id TEXT PRIMARY KEY,taskId TEXT NOT NULL,state TEXT NOT NULL,body TEXT NOT NULL,error TEXT,attempts INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS documents(key TEXT PRIMARY KEY,body TEXT NOT NULL);
    CREATE VIRTUAL TABLE IF NOT EXISTS tasks_search USING fts5(id UNINDEXED,text,tokenize='trigram');
    CREATE INDEX IF NOT EXISTS task_status ON tasks(json_extract(body,'$.status'),updated);
    CREATE INDEX IF NOT EXISTS task_assignee ON tasks(json_extract(body,'$.assignee'),updated);
    PRAGMA user_version=2;`);
  if(db.prepare('SELECT count(*) n FROM tasks_search').get().n!==db.prepare('SELECT count(*) n FROM tasks').get().n){db.exec('DELETE FROM tasks_search');for(const row of db.prepare('SELECT id,body FROM tasks').all())db.prepare('INSERT INTO tasks_search VALUES (?,?)').run(row.id,row.body.toLocaleLowerCase());}
  const get=key=>{const value=db.prepare('SELECT value FROM meta WHERE key=?').get(key);return value?JSON.parse(value.value):undefined;};
  const put=(key,value)=>db.prepare('INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
  function tx(action){db.exec('BEGIN IMMEDIATE');try{const result=action();check(!result?.then,'事务不允许异步副作用。');db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
  if(owner&&!get('owner'))put('owner',owner);
  let activeOwner=owner;
  const foreign=()=>!!activeOwner&&get('owner')!==activeOwner;
  if(!get('stream'))put('stream',randomUUID());
  function task(taskId){const row=db.prepare('SELECT body FROM tasks WHERE id=?').get(taskId);check(row,'找不到任务。','COOP_TASK_NOT_FOUND');return JSON.parse(row.body);}
  function save(value){value.updatedAt=new Date().toISOString();value.revision=(value.revision??0)+1;db.prepare('INSERT INTO tasks VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,updated=excluded.updated,body=excluded.body').run(value.id,value.revision,value.updatedAt,JSON.stringify(value));db.prepare('DELETE FROM tasks_search WHERE id=?').run(value.id);db.prepare('INSERT INTO tasks_search VALUES (?,?)').run(value.id,JSON.stringify(value).toLocaleLowerCase());return value;}
  function event(peer,kind,payload){check(!foreign()&&nodeId(activeOwner),'此数据库来自另一实例，队列仅供查看。','COOP_INSTANCE_CHANGED');const seq=(get('send:'+peer)??0)+1;put('send:'+peer,seq);const value={protocol:'ksf-cooperation-v1',id:randomUUID(),stream:get('stream'),seq,kind,payload};db.prepare('INSERT INTO events(id,peer,seq,direction,applied,body) VALUES (?,?,?,?,1,?)').run(value.id,peer,seq,'out',JSON.stringify(value));db.prepare('INSERT INTO outbox VALUES (?,?,?,NULL,NULL,0,NULL,?)').run(value.id,peer,'queued',new Date().toISOString());return value;}
  function operation(operationId,input,action){check(id(operationId),'写操作需要稳定的 operationId。');const digest=hash(input),old=db.prepare('SELECT * FROM operations WHERE id=?').get(operationId);if(old){check(old.digest===digest,'同一操作编号已绑定不同请求。','COOP_OPERATION_CONFLICT');return JSON.parse(old.result);}return tx(()=>{const result=action();db.prepare('INSERT INTO operations VALUES (?,?,?)').run(operationId,digest,JSON.stringify(result));return result;});}
  function legacyStore(initial){return {read:async()=>({data:JSON.parse(db.prepare("SELECT body FROM documents WHERE key='messages'").get()?.body??JSON.stringify(initial))}),update:async action=>tx(()=>{const previous=JSON.parse(db.prepare("SELECT body FROM documents WHERE key='messages'").get()?.body??JSON.stringify(initial)),next=action(previous);check(!next?.then,'消息更新必须同步。');db.prepare("INSERT INTO documents VALUES ('messages',?) ON CONFLICT(key) DO UPDATE SET body=excluded.body").run(JSON.stringify(next));return {data:next};})};}
  return {db,get,put,tx,task,save,event,operation,get foreign(){return foreign();},get owner(){return activeOwner;},bindOwner(value){check(nodeId(value),'实例身份无效。');activeOwner=value;if(!get('owner'))put('owner',value);return !foreign();},legacyStore,close:()=>db.close()};
}
