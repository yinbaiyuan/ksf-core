// Real packaged processes + mTLS transport. Temporary instances only.
import assert from 'node:assert/strict';import {mkdtemp,realpath,readFile,rm,mkdir,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {randomUUID} from 'node:crypto';
import {createCoreHost} from '../../../runtime/src/services/core-host.js';
const APP='com.ksf.cooperation-center',storeDirectory=process.argv[2],evidencePath=process.argv[3];assert.ok(storeDirectory);const roots=await Promise.all([1,2].map(async()=>realpath(await mkdtemp(join(tmpdir(),'ksf-cooperation-host-'))))),hosts=roots.map(root=>createCoreHost(root,{applications:{defaultSource:null,storeDirectory}}));
const sleep=()=>new Promise(r=>setTimeout(r,100));
try{
 hosts.forEach(h=>h.start());const communications=await Promise.all(hosts.map(h=>h.communication));await Promise.all(communications.map(c=>c.configure({enabled:true,host:'127.0.0.1',port:0,discovery:false})));const [a,b]=await Promise.all(communications.map(c=>c.snapshot()));
 for(const [index,other] of [[0,b],[1,a]]){await communications[index].trust({identity:other.identity,fingerprint:other.identity.fingerprint,host:'127.0.0.1',port:other.listener.port});await communications[index].grant({appId:APP,channel:'lan.message.v1',peers:[other.identity.nodeId],activation:true});}
 await Promise.all(hosts.map(h=>h.applications.snapshot()));const release=(await hosts[0].applications.snapshot()).installed.find(i=>i.id===APP).active;
 const bRelease=(await hosts[1].applications.snapshot()).installed.find(i=>i.id===APP).active;
 const bWindow=await hosts[1].applications.launch(APP,bRelease.digest,{kind:'window'});
 const local=await hosts[1].applications.call(bWindow.id,'offer.list');const offerId=randomUUID();
 const offerInput={operationId:randomUUID(),ifRevision:local.revision,offerId,name:'灯光验收说明',description:'整理验收记录并交付中文说明',inputs:'验收目标与记录',outputs:'中文说明',handling:'manual',delivery:'auto',instructions:'私有处理要求：只核对灯光验收',scope:null,published:true};
 const saved=await hosts[1].applications.call(bWindow.id,'offer.save',offerInput);assert.equal(saved.rules.find(r=>r.offerId===offerId).published,true);
 await assert.rejects(hosts[1].applications.invoke(APP,'offer.save',{...offerInput,operationId:randomUUID(),ifRevision:saved.revision}),{code:'COOP_HUMAN_REQUIRED'});
 await hosts[0].applications.invoke(APP,'peer.offers.refresh',{peerId:b.identity.nodeId});let catalog;
 for(let i=0;i<200;i++){catalog=await hosts[0].applications.invoke(APP,'peer.offers',{peerId:b.identity.nodeId});if(catalog.supported&&catalog.offers.some(o=>o.offerId===offerId))break;await sleep();}
 assert.equal(catalog.supported,true);assert.equal(catalog.offers.length,2);assert.ok(!JSON.stringify(catalog).includes('私有处理要求'));assert.ok(!JSON.stringify(catalog).includes('scope'));
 const request=await hosts[0].applications.cliExec(APP,'task.create',{expectedPackageDigest:release.digest,operationId:randomUUID(),params:{peerId:b.identity.nodeId,offerId,offerRevision:1,goal:'真实双实例合作：整理灯光验收说明'}});
 let task;for(let i=0;i<200;i++){const rows=await hosts[1].applications.invoke(APP,'task.list',{view:'attention'});task=rows.tasks.find(t=>t.id===request.id);if(task)break;await sleep();}assert.ok(task,'B should acquire the task');assert.equal(task.status,'pending');
 assert.equal(task.offer.offerId,offerId);assert.equal(task.automation.handling,'manual');
 const imported=await hosts[1].applications.cliExec(APP,'material.text',{expectedPackageDigest:bRelease.digest,operationId:randomUUID(),params:{name:'验收成果.md',text:'真实链路成果，灯光逐项通过。'}});
 const delivered=await hosts[1].applications.cliExec(APP,'task.deliver',{expectedPackageDigest:bRelease.digest,operationId:randomUUID(),params:{taskId:task.id,revision:task.revision,summary:'已完成灯光验收说明',materials:[imported]}});assert.equal(delivered.status,'completed');
 let result;for(let i=0;i<200;i++){result=await hosts[0].applications.invoke(APP,'task.get',{taskId:request.id});if(result.status==='completed')break;await sleep();}assert.equal(result.status,'completed');assert.equal(result.deliveries.length,1);assert.equal(result.deliveries[0].materials[0].digest,imported.digest);
 const lease=await hosts[0].applications.launch(APP,release.digest,{kind:'window'});const download=await hosts[0].applications.download(lease.id,{digest:imported.digest});assert.equal(download.name,'验收成果.md');assert.match(download.bytes.toString(),/真实链路成果/);await hosts[0].applications.release(lease.id);await hosts[1].applications.release(bWindow.id);
 const search=await hosts[0].applications.invoke(APP,'task.list',{view:'history',query:'灯光'});assert.equal(search.total,1);
 const evidence={ok:true,kind:'packaged-two-instance-mtls-task-delivery',platform:process.platform,at:new Date().toISOString(),version:release.manifest.version,assertions:['public-offering-selection','window-only-publication','catalog-privacy','CLI-request-and-delivery','paired-independent-identities','background-custody','B-submit-completes-A','content-addressed-delivery','host-verified-download','Chinese-history-search']};if(evidencePath){await mkdir(dirname(evidencePath),{recursive:true});await writeFile(evidencePath,JSON.stringify(evidence,null,2)+'\n');}console.log(JSON.stringify(evidence));
}finally{await Promise.all(hosts.map(h=>h.close()));await Promise.all(roots.map(r=>rm(r,{recursive:true,force:true})));}
