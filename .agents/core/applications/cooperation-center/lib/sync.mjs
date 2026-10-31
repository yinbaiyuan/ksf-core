import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {check,hash,nodeId} from './store.mjs';
import {manualOffer,checkedOffer} from './offers.mjs';
const APP='com.ksf.cooperation-center',CHANNEL='lan.message.v1';
export function createSync(context,store,tasks,materials,{catalog=()=>({revision:0,offers:[manualOffer()]})}={}){
  const db=store.db;let busy=false,lastError=null;
  db.exec('CREATE TABLE IF NOT EXISTS controls(id TEXT PRIMARY KEY,peer TEXT NOT NULL,body TEXT NOT NULL,attempt TEXT,state TEXT NOT NULL,updated INTEGER NOT NULL);');
  function control(peer,body){const id=randomUUID();db.prepare('INSERT INTO controls VALUES (?,?,?,NULL,?,?)').run(id,peer,JSON.stringify({protocol:'ksf-cooperation-control-v1',...body}),'queued',Date.now());return id;}
  function hello(peer,force=false){if(force||!store.get('hello:'+peer)){const nonce=randomUUID();store.put('hello:'+peer,nonce);control(peer,{kind:'hello',nonce});}}
  async function send(peer,body,operationId,refs=[]){
    const dir=join(context.dataDirectory,'transport');await mkdir(dir,{recursive:true,mode:0o700});const path=join(dir,operationId+'.json');await writeFile(path,JSON.stringify(body),{mode:0o600});
    const envelope=await context.messages.registerFile({path,name:'cooperation.json',mediaType:'application/json'}),parts=[{partId:'envelope',materialId:envelope.materialId}];
    for(const m of refs){const {path}=await materials.read(m.digest);const part=await context.messages.registerFile({path,name:m.name,mediaType:m.mediaType});parts.push({partId:'blob-'+m.digest,materialId:part.materialId});}
    return context.messages.send({operationId,to:{nodeId:peer,endpoint:{kind:'app',id:APP}},channel:CHANNEL,payloadPartId:'envelope',parts});
  }
  function references(event){const p=event.payload;const refs=[...(p.materials??[]),...Object.values(p.offerInputs??{}).filter(Array.isArray).flat().filter(m=>m?.digest),...(p.deliveries??[]).flatMap(d=>d.materials??[])];return [...new Map(refs.map(m=>[m.digest,m])).values()];}
  async function operation(row,body,refs,table){
    if(row.attempt){
      let state;
      try{state=await context.messages.status(row.attempt);if(state.status==='unconfirmed')state=await context.messages.reconcile(row.attempt);}
      catch(e){if(e.code!=='COMM_OPERATION_NOT_FOUND')throw e;state={status:'failed'};}
      if(['preparing','sending','confirming','unconfirmed'].includes(state.status)){
        if(table==='outbox')db.prepare('UPDATE outbox SET transport=?,state=?,updated=? WHERE id=?').run(state.status,'sending',new Date().toISOString(),row.id);return;
      }
      if(state.error){lastError={code:state.error.code,message:state.error.message};store.put('sync-error:'+row.peer,lastError);}
      if(state.status==='delivered'){
        if(table==='controls'){db.prepare('DELETE FROM controls WHERE id=?').run(row.id);return;}
        db.prepare('UPDATE outbox SET transport=?,state=? WHERE id=?').run('delivered','custody',row.id);
        // A transport receipt proves durable custody. Business acknowledgement is separate.
        if(Date.now()-Date.parse(row.updated)<20000)return;
      }
      db.prepare(`UPDATE ${table} SET attempt=NULL,updated=? WHERE id=?`).run(table==='outbox'?new Date().toISOString():Date.now(),row.id);return;
    }
    const attempt=randomUUID();
    db.prepare(`UPDATE ${table} SET attempt=?,state=?,updated=? WHERE id=?`).run(attempt,'sending',table==='outbox'?new Date().toISOString():Date.now(),row.id);
    if(table==='outbox')db.prepare('UPDATE outbox SET attempts=attempts+1 WHERE id=?').run(row.id);
    // The operation reference is committed before the transport side effect.
    await send(row.peer,body,attempt,refs);
  }
  async function tick(){
    if(busy||store.foreign||!nodeId(store.owner))return;busy=true;
    try{
      const directory=await context.peers.list(),peers=new Set(directory.paired.map(p=>p.nodeId));
      for(const row of db.prepare('SELECT * FROM controls ORDER BY updated LIMIT 20').all()){
        if(!peers.has(row.peer))continue;try{await operation(row,JSON.parse(row.body),[],'controls');}catch(e){lastError={code:e.code,message:e.message};}
      }
      // Send in source order. One missing event cannot be overtaken indefinitely.
      const rows=db.prepare("SELECT o.*,e.seq,e.body FROM outbox o JOIN events e ON e.id=o.id WHERE o.state NOT IN ('acknowledged','cancelled') ORDER BY e.seq").all();
      const handled=new Set();
      for(const row of rows){
        if(handled.has(row.peer)||!peers.has(row.peer))continue;handled.add(row.peer);
        const capability=store.get('capability:'+row.peer);if(!capability){hello(row.peer);continue;}
        const event=JSON.parse(row.body);if(event.kind==='task.request'&&event.payload.offerId&&capability.offersProtocol!==1){db.prepare('UPDATE outbox SET error=? WHERE id=?').run(JSON.stringify({code:'COOP_OFFERS_UNSUPPORTED',message:'对方尚未支持承接声明，请升级KSF合作。'}),row.id);continue;}
        try{const body=JSON.parse(row.body);await operation(row,body,references(body),'outbox');}catch(e){lastError={code:e.code,message:e.message};db.prepare('UPDATE outbox SET error=? WHERE id=?').run(JSON.stringify(lastError),row.id);}
      }
    }catch(e){lastError={code:e.code,message:e.message};}finally{busy=false;}
  }
  async function receive(event,body,manifest){
    const peer=manifest.from.nodeId;check(nodeId(peer)&&manifest.from.endpoint.kind==='app'&&['com.ksf.cooperation-center','com.yinbaiyuan.lan-messenger','yinbaiyuan.lan-messenger'].includes(manifest.from.endpoint.id),'任务消息来源端点无效。');
    const directory=await context.peers.list();check(directory.paired.some(p=>p.nodeId===peer),'合作实例配对已撤销。','COMM_PEER_UNTRUSTED');
    if(body.protocol==='ksf-cooperation-control-v1'){
      check(manifest.parts.length===1,'控制消息不能携带材料。');
      if(body.kind==='hello'){check(typeof body.nonce==='string'&&body.nonce.length<=64,'功能探测无效。');control(peer,{kind:'hello.reply',nonce:body.nonce,taskProtocol:1,offersProtocol:1,features:['workflow-offers-v1']});}
      else if(body.kind==='hello.reply'){if(body.nonce!==store.get('hello:'+peer))return;check(body.taskProtocol===1,'功能探测回执不匹配。');store.put('capability:'+peer,{protocol:1,offersProtocol:body.offersProtocol===1?1:0,features:Array.isArray(body.features)?body.features.filter(f=>f==='workflow-offers-v1'):[],at:new Date().toISOString()});if(body.offersProtocol===1)queueOffers(peer);else {const pending=store.get('offers-query:'+peer);if(pending)store.put('offers-query:'+peer,{...pending,completed:true});}}
      else if(body.kind==='offers.query'){
        check(typeof body.nonce==='string'&&body.nonce.length<=64,'声明查询无效。');control(peer,{kind:'offers.reply',nonce:body.nonce,...catalog(Array.isArray(body.features)?body.features:[])});
      }else if(body.kind==='offers.reply'){
        const pending=store.get('offers-query:'+peer);if(!pending||body.nonce!==pending.nonce)return;check(Number.isSafeInteger(body.revision)&&body.revision>=0&&Array.isArray(body.offers)&&body.offers.length<=101,'声明目录无效。');
        const offers=body.offers.map(checkedOffer);check(offers.some(o=>o.offerId==='manual')&&new Set(offers.map(o=>o.offerId)).size===offers.length,'声明目录缺少默认项或编号重复。');
        const previous=store.get('offers:'+peer);if(!previous||body.revision>=previous.revision)store.put('offers:'+peer,{revision:body.revision,offers,syncedAt:new Date().toISOString()});store.put('offers-query:'+peer,{...pending,completed:true});
      }else if(body.kind==='offers.changed'){
        if(!store.get('offers-query:'+peer)||store.get('offers-query:'+peer).completed)refreshOffers(peer);
      }else if(body.kind==='ack'){
        check(body.stream===store.get('stream')&&Number.isSafeInteger(body.through)&&body.through>=0&&body.through<=(store.get('send:'+peer)??0),'业务接管回执无效。');
        db.prepare("UPDATE outbox SET state='acknowledged' WHERE id IN (SELECT id FROM events WHERE direction='out' AND peer=? AND seq<=?) AND state!='cancelled'").run(peer,body.through);
      }else check(false,'未知同步控制消息。');return;
    }
    check(body.protocol==='ksf-cooperation-v1','不支持的合作协议。');
    const refs=references(body),expected=new Set(['envelope',...refs.map(m=>'blob-'+m.digest)]);check(manifest.parts.length===expected.size&&manifest.parts.every(p=>expected.has(p.partId)),'材料清单不匹配。');
    for(const m of refs){const part=manifest.parts.find(p=>p.partId==='blob-'+m.digest);check(part?.sha256===m.digest&&part.byteLength===m.size,'材料摘要与任务引用不符。');const bytes=(await import('node:fs/promises')).readFile;const imported=await materials.put(await bytes((await context.messages.readPart(event.messageId,part.partId)).path),m);check(imported.digest===m.digest,'材料导入失败。');}
    const result=tasks.receive(peer,body);control(peer,{kind:'ack',stream:body.stream,through:result.through??store.get('receive:'+peer)??0});
  }
  function queueOffers(peer){const pending=store.get('offers-query:'+peer);if(!pending||pending.completed||pending.queued)return;store.put('offers-query:'+peer,{...pending,queued:true});control(peer,{kind:'offers.query',nonce:pending.nonce,features:store.get('capability:'+peer)?.features??[]});}
  function refreshOffers(peer){const pending=store.get('offers-query:'+peer);if(pending&&!pending.completed&&Date.now()-pending.at<30000)return;const nonce=randomUUID();store.put('offers-query:'+peer,{nonce,at:Date.now(),completed:false});hello(peer,true);if(store.get('capability:'+peer)?.offersProtocol===1)queueOffers(peer);}
  function offers(peer){const cached=store.get('offers:'+peer),capability=store.get('capability:'+peer);return {peerId:peer,offers:cached?.offers??[manualOffer()],revision:cached?.revision??null,syncedAt:cached?.syncedAt??null,state:!cached?'unconfirmed':store.get('offers-query:'+peer)?.completed===false?'refreshing':'cached',supported:capability?.offersProtocol===1,features:capability?.features??[],pending:store.get('offers-query:'+peer)?.completed===false};}
  const status=()=>({instanceMatches:!store.foreign,lastError,capabilities:[...new Set(db.prepare('SELECT peer FROM outbox').all().map(r=>r.peer))].map(peer=>({peer,confirmed:!!store.get('capability:'+peer),error:store.get('sync-error:'+peer)??null})),peers:db.prepare("SELECT peer,state,transport,count(*) count FROM outbox GROUP BY peer,state,transport").all(),queue:db.prepare("SELECT id,peer,state,transport,attempts,error,updated FROM outbox ORDER BY updated DESC LIMIT 100").all(),controls:db.prepare('SELECT count(*) count FROM controls').get().count});
  return {tick,receive,status,hello,control,refreshOffers,offers};
}
