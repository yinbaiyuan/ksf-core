import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import assert from 'node:assert/strict';
import {createCommunicationService} from '../src/communication/service.js';
const roots=await Promise.all([1,2].map(()=>mkdtemp(join(tmpdir(),'ksf-size-')))),services=await Promise.all(roots.map(root=>createCommunicationService(root))),[a,b]=services,report={node:process.version,platform:process.platform,transport:'mTLS HTTPS over loopback',sizes:[]};
try{
 await Promise.all(services.map(s=>s.configure({enabled:true,host:'127.0.0.1',port:0,discovery:false})));const [sa,sb]=await Promise.all(services.map(s=>s.snapshot()));await a.trust({identity:sb.identity,fingerprint:sb.identity.fingerprint,host:'127.0.0.1',port:sb.listener.port});await b.trust({identity:sa.identity,fingerprint:sa.identity.fingerprint,host:'127.0.0.1',port:sa.listener.port});const from=(await a.openEndpoint({key:'sizes',channels:['message.v1'],peers:[]})).endpoint,to=(await b.openEndpoint({key:'sizes',channels:['message.v1'],peers:[sa.identity.nodeId]})).endpoint;
 for(const sizeMiB of [50,200,1024]){let peakRSS=process.memoryUsage().rss;const baselineRSS=peakRSS,timer=setInterval(()=>{peakRSS=Math.max(peakRSS,process.memoryUsage().rss);},20),started=performance.now();try{
  const size=sizeMiB*1024**2,material=await a.registerMaterial(from,Readable.from((async function*(){let left=size;const chunk=Buffer.alloc(64*1024,65);while(left){const length=Math.min(left,chunk.length);yield chunk.subarray(0,length);left-=length;}})()),{name:'large-text.txt',mediaType:'text/plain'}),registeredAt=performance.now();const operationId=randomUUID(),operation=await a.send(from,{operationId,to:{nodeId:sb.identity.nodeId,endpoint:to},channel:'message.v1',payloadPartId:'text',parts:[{partId:'text',materialId:material.materialId}]});let result;
  const deadline=Date.now()+120000;while(Date.now()<deadline){result=await a.getOperation(from,operationId);if(['delivered','failed','unconfirmed'].includes(result.status))break;await new Promise(r=>setTimeout(r,25));}assert.equal(result.status,'delivered',JSON.stringify(result.error));const deliveredAt=performance.now(),part=await b.readPart(to,operation.messageId,'text'),hash=createHash('sha256');for await(const bytes of createReadStream(part.path))hash.update(bytes);assert.equal(hash.digest('hex'),material.sha256);assert.equal(part.byteLength,size);peakRSS=Math.max(peakRSS,process.memoryUsage().rss);const row={sizeMiB,registrationMs:Math.round(registeredAt-started),deliveryMs:Math.round(deliveredAt-registeredAt),baselineRSS,peakRSS,growthBytes:peakRSS-baselineRSS,sha256:material.sha256};report.sizes.push(row);console.log(JSON.stringify(row));if(sizeMiB===1024)assert(peakRSS-baselineRSS<256*1024**2,'streaming memory grew by >=256 MiB');
 }finally{clearInterval(timer);}}
 report.ok=true;
}finally{await Promise.all(services.map(s=>s.close()));await Promise.all(roots.map(root=>rm(root,{recursive:true,force:true})));if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');}
