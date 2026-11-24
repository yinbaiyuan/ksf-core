// Explicit diagnostic preload. Record aggregate costs, never arguments or env.
import fs from 'node:fs';
import child from 'node:child_process';
import {basename} from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
const metrics={},put=(key,ms)=>{const item=metrics[key]??={calls:0,milliseconds:0};item.calls++;item.milliseconds+=ms;};
for(const name of ['readFileSync','lstatSync','readdirSync','cpSync','renameSync','fsyncSync']){
 const original=fs[name];fs[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{put(name,performance.now()-start);}};
}
const originalSpawn=child.spawnSync;
child.spawnSync=function(...args){
 const command=basename(String(args[0])).toLowerCase(),argv=Array.isArray(args[1])?args[1]:[];
 const verb=/^git(?:\.exe)?$/.test(command)?argv.find(a=>['rev-parse','rev-list','status','show','config','add','commit','cat-file','ls-tree','init','update-index','merge-base','checkout','branch','clone'].includes(a))??'other':/^powershell/.test(command)?'powershell':/^node/.test(command)?argv.includes('--check')?'node-syntax':'node':'other';
 const start=performance.now();try{return originalSpawn.apply(this,args);}finally{put('spawn:'+verb,performance.now()-start);}
};
syncBuiltinESMExports();
const write=fs.writeFileSync;
process.on('exit',()=>{if(process.env.KSF_VOLUME_METRICS)write(process.env.KSF_VOLUME_METRICS+'-'+process.pid+'.json',JSON.stringify(metrics));});
