// Explicit acceptance harness. No user workspace or production state is used.
import {createInterface} from 'node:readline';
import {Readable} from 'node:stream';
import {readFile,mkdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {createCommunicationService} from '../src/communication/service.js';
import {compareVersions} from '../src/applications/protocol.js';
import {createApplicationManager} from '../src/applications/manager.js';
import {createLocalControl} from '../src/communication/control.js';
const [rootArg,host,port,storeArg]=process.argv.slice(2);if(!rootArg||!host)throw Error('usage: communication-node.mjs <test-root> <IPv4> <port> [test-store]');
const root=resolve(rootArg);await mkdir(root,{recursive:true});let service,control;
const actor=caller=>({kind:'app',id:caller.appId});
const messages=Object.fromEntries(['send','getOperation','reconcile','cancel','inbox','readMessage','readPart'].map(method=>[({getOperation:'status',readMessage:'read'})[method]??method,async(caller,...args)=>service[method](actor(caller),...args)]));messages.registerFile=(caller,input)=>control.registerFile(caller,input);
const apps=createApplicationManager(root,{storeDirectory:storeArg?resolve(storeArg):undefined,services:{messages,peers:{list:async()=>({paired:Object.values((await service.snapshot()).config.peers)})}}});
service=await createCommunicationService(root,{applications:apps});control=createLocalControl(root,{applications:apps,communication:Promise.resolve(service)});
await service.configure({enabled:true,host,port:Number(port??0),discovery:true});await apps.startBackground();
const snapshot=await service.snapshot();console.log(JSON.stringify({ready:true,root,node:process.version,platform:process.platform,pid:process.pid,identity:snapshot.identity,listener:snapshot.listener}));
const lines=createInterface({input:process.stdin});
async function invoke(op,input){switch(op){
 case 'state':return service.snapshot();case 'trust':return service.trust(input);case 'endpoint':return service.openEndpoint(input);case 'grant':return service.grant(input);
 case 'material':return service.registerMaterial(input.caller,Readable.from((async function*(){let left=input.size??0;while(left){const length=Math.min(left,64*1024);yield Buffer.alloc(length,90);left-=length;}})()),{name:'large.bin',mediaType:'application/octet-stream'});
 case 'send':return service.send(input.caller,input.message);case 'status':return service.getOperation(input.caller,input.operationId);case 'reconcile':return service.reconcile(input.caller,input.operationId);case 'inbox':return service.inbox(input.caller,input.query);
 case 'part':{const part=await service.readPart(input.caller,input.messageId,input.partId),hash=createHash('sha256');for await(const chunk of createReadStream(part.path))hash.update(chunk);return {...part,actualSha256:hash.digest('hex'),path:undefined};}
 case 'install':{const index=JSON.parse(await readFile(resolve(storeArg,'index.json'),'utf8')),entry=index.apps.filter(v=>v.manifest.id===input.appId).sort((a,b)=>compareVersions(b.manifest.version,a.manifest.version))[0];return apps.install({trusted:true,sourceId:'builtin',appId:input.appId,version:entry.manifest.version,digest:entry.package.sha256});}
 case 'docs':return apps.cliDocs(input.appId);case 'cli':return apps.cliExec(input.appId,input.command,input.request);case 'route':return apps.messageRoute(input.appId,input.channel);
 default:throw Error('unknown acceptance operation');
}}
for await(const line of lines){let cmd;try{cmd=JSON.parse(line);const data=await invoke(cmd.op,cmd.input??{});console.log(JSON.stringify({id:cmd.id,ok:true,data}));}catch(e){console.log(JSON.stringify({id:cmd?.id,ok:false,error:{code:e.code,message:e.message}}));}}
await apps.close();await service.close();
