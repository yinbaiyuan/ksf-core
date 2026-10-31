import {createServer,request as httpsRequest} from 'node:https';
import {X509Certificate} from 'node:crypto';
import {isIP} from 'node:net';
import {certificateIdentity,publicIdentity} from './identity.js';
import {ensure,error,uuid,hash,label,sha256,serialize} from './contracts.js';

const TTL=5*60*1000,port=n=>Number.isInteger(n)&&n>0&&n<=65535;
const terminal=new Set(['accepted','rejected','expired','cancelled','failed']);
const active=row=>!terminal.has(row.status);
const address=value=>value?.replace(/^::ffff:/,'');
const ipNumber=value=>value.split('.').reduce((n,v)=>(n*256+Number(v))>>>0,0);
export function verifyPairingIdentity(identity,now=Date.now()){
 ensure(identity?.protocol==='ksf-peer-identity-v1'&&typeof identity.certificate==='string'&&identity.certificate.length<8192,'COMM_PAIRING_IDENTITY','配对身份无效。');
 const cert=new X509Certificate(identity.certificate),info=certificateIdentity(identity.certificate);
 ensure(cert.verify(cert.publicKey)&&cert.subject===cert.issuer&&Date.parse(cert.validFrom)<=now&&Date.parse(cert.validTo)>now&&info.nodeId===identity.nodeId&&info.fingerprint===identity.fingerprint,'COMM_PAIRING_IDENTITY','配对证书或节点身份不匹配。',403);
 return {protocol:'ksf-peer-identity-v1',...info};
}

/** A separate, restricted bootstrap listener. The message listener keeps strict mTLS. */
export function createPairingService({store,getIdentity,getLocal,discoveries,applications,interfaces,now=Date.now,onTrustChanged}){
 let server,closed=false,polling=false;const rates=new Map();
 const publicRow=row=>({requestId:row.requestId,direction:row.direction,nodeId:row.remote.nodeId,name:row.remote.name,host:row.remote.host,appId:row.appId,channel:row.channel,status:active(row)&&row.expiresAt<=now()?'expired':row.status,createdAt:row.createdAt,expiresAt:row.expiresAt,code:row.code,error:row.error??null});
 async function list(appId){const names=Object.fromEntries(((await applications?.messageRoutes?.())??[]).map(r=>[r.appId,r.name]));return Object.values((await store.config()).pairings??{}).filter(row=>(!appId||row.appId===appId)&&row.createdAt+30*60*1000>now()).map(row=>({...publicRow(row),appName:names[row.appId]??row.appId})).sort((a,b)=>b.createdAt-a.createdAt);}
 async function route(appId,channel){ensure(label(appId)&&label(channel)&&(await applications?.messageRoute(appId,channel))?.enabled,'COMM_PAIRING_APP_UNAVAILABLE','双方需要安装并启用支持此通道的应用。',409);}
 function prune(cfg){cfg.pairings??={};for(const [id,row] of Object.entries(cfg.pairings)){if(active(row)&&row.expiresAt<=now())row.status='expired';if(terminal.has(row.status)&&row.createdAt+30*60*1000<=now())delete cfg.pairings[id];}}
 async function change(id,action){return store.update(async cfg=>{prune(cfg);const row=cfg.pairings[id];ensure(row,'COMM_PAIRING_NOT_FOUND','找不到配对请求。',404);return action(row,cfg);});}
 function usable(row){ensure(row.expiresAt>now()&&!['rejected','cancelled','expired','failed'].includes(row.status),'COMM_PAIRING_CLOSED','配对请求已结束或过期，请重新请求。',409);}
 function rate(host){const cutoff=now()-60000;for(const [key,times] of rates){const valid=times.filter(t=>t>cutoff);if(valid.length)rates.set(key,valid);else rates.delete(key);}const times=rates.get(host)??[];ensure(times.length<12&&rates.size<128,'COMM_PAIRING_RATE_LIMIT','配对请求过于频繁，请稍后重试。',429);rates.set(host,[...times,now()]);}
 function apply(cfg,row){const info=row.remote.identity,previous=cfg.peers[info.nodeId];ensure(!previous||previous.fingerprint===info.fingerprint,'COMM_PAIRING_IDENTITY_CHANGED','已有节点的证书已变化，请先核对身份。',409);cfg.peers[info.nodeId]={...info,host:row.remote.host,port:row.remote.port,name:row.remote.name};const key=row.appId+'|'+row.channel,current=cfg.grants[key];cfg.grants[key]={peers:[...new Set([...(current?.peers??[]),info.nodeId])],activation:true};}
 async function wire(remote,path,input){
  const me=await getIdentity(),body=Buffer.from(JSON.stringify(input));
  return new Promise((resolve,reject)=>{
   const req=httpsRequest({host:remote.host,port:remote.pairingPort,path:'/pairing/v1/'+path,method:'POST',key:me.privateKey,cert:me.certificate,servername:'ksf-pairing.local',rejectUnauthorized:false,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(6000),headers:{'content-type':'application/json','content-length':body.length}},res=>{
    let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>16384)res.destroy(error('COMM_PAIRING_RESPONSE','配对响应过大。'));else chunks.push(chunk);});res.on('error',reject);res.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks));if(!value.ok)throw Object.assign(error(value.error?.code??'COMM_PAIRING_FAILED',value.error?.message??'配对请求失败。',res.statusCode));resolve(value.data);}catch(e){reject(e);}});
   });
   req.on('error',reject);req.setTimeout(5000,()=>req.destroy(error('COMM_PAIRING_TIMEOUT','无法连接对方，请确认对方后台在线。',504)));
   // Do not send even HTTP headers until the TLS peer proves possession of the discovered key.
   req.once('socket',socket=>socket.once('secureConnect',()=>{try{const raw=socket.getPeerCertificate(true).raw;ensure(raw,'COMM_PAIRING_IDENTITY','对方未提供证书。',403);const cert=new X509Certificate(raw),info=verifyPairingIdentity({protocol:'ksf-peer-identity-v1',...certificateIdentity(cert.toString())},now());ensure(info.nodeId===remote.nodeId&&(!remote.identity||remote.identity.fingerprint===info.fingerprint),'COMM_PAIRING_IDENTITY','连接身份与发现的节点不一致。',403);req.end(body);}catch(e){req.destroy(e);}}));
  });
 }
 async function request(input){
  ensure(uuid(input?.requestId)&&hash(input.nodeId),'COMM_PAIRING_INVALID','配对请求编号或目标无效。');await route(input.appId,input.channel);
  const local=getLocal();ensure(local.listener&&server,'COMM_DISABLED','请先开启本机内网通信。',503);const remote=discoveries.get(input.nodeId);ensure(remote&&port(remote.pairingPort),'COMM_PAIRING_UNAVAILABLE','对方尚未支持便捷配对，或没有被发现，请刷新并确认双方版本。',409);
  const me=publicIdentity(await getIdentity()),expiresAt=now()+TTL;
  const current=await store.update(cfg=>{prune(cfg);const same=cfg.pairings[input.requestId];if(same){ensure(same.direction==='outgoing'&&same.appId===input.appId&&same.channel===input.channel&&same.remote.nodeId===input.nodeId,'COMM_PAIRING_CONFLICT','相同请求编号已被使用。',409);return same;}
   const existing=Object.values(cfg.pairings).find(r=>r.direction==='outgoing'&&r.remote.nodeId===input.nodeId&&r.appId===input.appId&&active(r));if(existing)return existing;
   ensure(Object.keys(cfg.pairings).length<128,'COMM_PAIRING_BUSY','配对记录已满，请稍后重试。',429);return cfg.pairings[input.requestId]={requestId:input.requestId,direction:'outgoing',appId:input.appId,channel:input.channel,status:'requesting',remote:{...remote},createdAt:now(),expiresAt,code:sha256([input.requestId,...[me.nodeId,input.nodeId].sort()].join(':')).slice(0,8).toUpperCase()};
  });if(current.status!=='requesting')return publicRow(current);
  try{const result=await wire(current.remote,'request',{protocol:'ksf-pairing-v1',requestId:current.requestId,identity:me,targetNodeId:input.nodeId,name:getLocal().device?.name,port:local.listener.port,pairingPort:server.address().port,appId:input.appId,channel:input.channel,expiresAt:current.expiresAt});const identity=verifyPairingIdentity(result.identity,now());ensure(identity.nodeId===input.nodeId,'COMM_PAIRING_IDENTITY','对方身份与目标不符。',403);
   return await change(current.requestId,row=>{row.remote={...row.remote,identity,name:result.name};if(row.status==='requesting')row.status=result.status==='rejected'?'rejected':'pending';return publicRow(row);});
  }catch(e){await change(current.requestId,row=>{if(row.status==='requesting'){row.status='failed';row.error=serialize(e);}});throw e;}
 }
 async function answer({requestId,accept,appId}){
  ensure(uuid(requestId)&&typeof accept==='boolean','COMM_PAIRING_INVALID','配对响应无效。');let row;
  await change(requestId,async value=>{ensure(value.direction==='incoming'&&(!appId||value.appId===appId),'COMM_FORBIDDEN','请求不属于此应用。',403);await route(value.appId,value.channel);if(value.status==='accepted'){row=value;return;}usable(value);if(!accept){ensure(value.status==='pending','COMM_PAIRING_CLOSED','已同意的配对正在确认中。',409);value.status='rejected';}else if(value.status==='pending')value.status='accepting';row=structuredClone(value);});
  if(!accept||row.status==='accepted')return publicRow(row);
  try{
   if(row.status==='accepting'){
    await wire(row.remote,'approve',{requestId,identity:publicIdentity(await getIdentity()),name:getLocal().device?.name});
    await change(requestId,async(value,cfg)=>{usable(value);await route(value.appId,value.channel);apply(cfg,value);value.status='confirming';value.error=null;});
    await onTrustChanged();
   }
   await wire(row.remote,'complete',{requestId});
   return await change(requestId,value=>{usable(value);value.status='accepted';value.error=null;return publicRow(value);});
  }catch(e){await change(requestId,value=>{value.error=serialize(e);});throw e;}
 }
 async function handle(req,res){
  const json=(status,data,failed=false)=>{if(res.destroyed||res.headersSent)return;res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(failed?{ok:false,error:serialize(data)}:{ok:true,data}));};
  try{
   req.setTimeout(5000,()=>req.destroy());const host=address(req.socket.remoteAddress),cfg=await store.config(),nic=interfaces().find(i=>i.address===cfg.host);
   ensure(isIP(host)===4&&nic&&((ipNumber(host)&ipNumber(nic.netmask))===(ipNumber(nic.address)&ipNumber(nic.netmask))),'COMM_PAIRING_SUBNET','配对只接受同一子网。',403);
   const raw=req.socket.getPeerCertificate(true).raw;ensure(raw,'COMM_PAIRING_IDENTITY','配对需要设备证书。',403);const peer=verifyPairingIdentity({protocol:'ksf-peer-identity-v1',...certificateIdentity(new X509Certificate(raw).toString())},now());
   ensure(req.method==='POST'&&req.headers['content-type']==='application/json','COMM_PAIRING_INVALID','配对需要 JSON POST。');let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;ensure(size<=16384,'COMM_PAIRING_TOO_LARGE','配对参数过大。',413);chunks.push(chunk);}let input;try{input=JSON.parse(Buffer.concat(chunks));}catch{throw error('COMM_PAIRING_INVALID','配对参数不是有效 JSON。');}ensure(uuid(input?.requestId),'COMM_PAIRING_INVALID','请求编号无效。');
   const action=new URL(req.url,'https://ksf-pairing.local').pathname.slice('/pairing/v1/'.length);ensure(req.url.startsWith('/pairing/v1/')&&['request','approve','complete','status'].includes(action),'COMM_PAIRING_ROUTE','配对路由不存在。',404);
   if(action==='request'){
    input={...input,appId:await applications?.resolveApplicationId?.(input.appId)??input.appId};
    rate(host);const me=publicIdentity(await getIdentity()),supplied=verifyPairingIdentity(input.identity,now());ensure(input.protocol==='ksf-pairing-v1'&&input.targetNodeId===me.nodeId&&peer.nodeId===supplied.nodeId&&peer.fingerprint===supplied.fingerprint&&peer.nodeId!==me.nodeId&&port(input.port)&&port(input.pairingPort)&&Number.isSafeInteger(input.expiresAt)&&input.expiresAt>now()&&input.expiresAt<=now()+TTL+30000,'COMM_PAIRING_INVALID','配对身份、时限或地址无效。',403);await route(input.appId,input.channel);
    const row=await store.update(cfg=>{prune(cfg);const old=cfg.pairings[input.requestId];if(old){ensure(old.direction==='incoming'&&old.remote.nodeId===peer.nodeId&&old.remote.identity.fingerprint===peer.fingerprint&&old.appId===input.appId&&old.channel===input.channel,'COMM_PAIRING_CONFLICT','请求编号与原内容不符。',409);return old;}
     ensure(Object.keys(cfg.pairings).length<128&&Object.values(cfg.pairings).filter(r=>active(r)).length<32,'COMM_PAIRING_BUSY','待处理配对请求过多。',429);
     ensure(!Object.values(cfg.pairings).some(r=>r.direction==='incoming'&&r.remote.nodeId===peer.nodeId&&r.appId===input.appId&&active(r)),'COMM_PAIRING_PENDING','已有此节点的待处理请求。',409);
     return cfg.pairings[input.requestId]={requestId:input.requestId,direction:'incoming',appId:input.appId,channel:input.channel,status:'pending',createdAt:now(),expiresAt:Math.min(input.expiresAt,now()+TTL),remote:{nodeId:peer.nodeId,identity:peer,host,port:input.port,pairingPort:input.pairingPort,name:String(input.name??'KSF 节点').slice(0,80)},code:sha256([input.requestId,...[peer.nodeId,me.nodeId].sort()].join(':')).slice(0,8).toUpperCase()};
    });json(200,{identity:me,name:getLocal().device?.name,status:publicRow(row).status});return;
   }
   let changed=false;const result=await change(input.requestId,async(row,cfg)=>{
    ensure(row.remote.nodeId===peer.nodeId&&(!row.remote.identity||row.remote.identity.fingerprint===peer.fingerprint),'COMM_PAIRING_IDENTITY','配对响应来自其他身份。',403);
    if(action==='status')return {status:publicRow(row).status};
    ensure(row.direction==='outgoing','COMM_FORBIDDEN','配对响应方向无效。',403);usable(row);await route(row.appId,row.channel);
    if(action==='approve'){
     const supplied=verifyPairingIdentity(input.identity,now());ensure(supplied.fingerprint===peer.fingerprint,'COMM_PAIRING_IDENTITY','配对响应身份不符。',403);
     row.remote={...row.remote,identity:peer,name:String(input.name??row.remote.name).slice(0,80)};if(['requesting','pending'].includes(row.status))row.status='confirming';
    }else{ensure(['confirming','accepted'].includes(row.status)&&row.remote.identity,'COMM_PAIRING_CLOSED','尚未收到对方的同意。',409);if(row.status!=='accepted'){apply(cfg,row);row.status='accepted';changed=true;}}
    return {status:row.status};
   });if(changed)await onTrustChanged();json(200,result);
  }catch(e){json(e.status??500,e,true);}
 }
 async function start(me,cfg){
  const desired=cfg.pairingPort??(cfg.port>0&&cfg.port<65535?cfg.port+1:0),current=server?.address();
  if(current?.address===cfg.host&&(!desired||desired===current.port))return;
  await stop();server=createServer({key:me.privateKey,cert:me.certificate,requestCert:true,rejectUnauthorized:false,minVersion:'TLSv1.2',headersTimeout:5000,requestTimeout:10000},(req,res)=>{void handle(req,res);});server.on('error',()=>{});server.maxConnections=32;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(desired,cfg.host,resolve);});
 }
 async function stop(){if(server){const previous=server;server=undefined;previous.closeAllConnections();await new Promise(resolve=>previous.close(resolve));}}
 async function invalidate(nodeId){await store.update(cfg=>{for(const row of Object.values(cfg.pairings??{}))if(row.remote.nodeId===nodeId)row.status='cancelled';});}
 async function poll(){if(closed||polling||!server)return;polling=true;try{
  for(const saved of Object.values((await store.config()).pairings??{})){
   if(closed)break;
   if(saved.expiresAt<=now()||!(saved.direction==='outgoing'&&['pending','confirming'].includes(saved.status)||saved.direction==='incoming'&&saved.status==='confirming'))continue;
   try{const result=await wire(saved.remote,'status',{requestId:saved.requestId});let changed=false;await change(saved.requestId,async(row,cfg)=>{usable(row);if(saved.direction==='outgoing'&&row.status==='confirming'&&['confirming','accepted'].includes(result.status)){await route(row.appId,row.channel);apply(cfg,row);row.status='accepted';row.error=null;changed=true;}else if(saved.direction==='incoming'&&result.status==='accepted'){row.status='accepted';row.error=null;}else if(['rejected','expired','cancelled'].includes(result.status))row.status=result.status;});if(changed)await onTrustChanged();}catch{/* Requests expire; polling never creates a new pairing or sends business messages. */}
  }
 }finally{polling=false;}}
 const timer=setInterval(()=>{void poll().catch(()=>{});},2000);timer.unref();
 async function close(){closed=true;clearInterval(timer);await stop();while(polling)await new Promise(resolve=>setTimeout(resolve,10));}
 return {request,answer,list,start,stop,invalidate,poll,close,get listener(){const a=server?.address();return a?{host:a.address,port:a.port}:null;}};
}
