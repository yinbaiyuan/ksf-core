// Opt-in local browser walkthrough. All state is fictional and isolated.
import {mkdtemp,cp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {startWebServer} from '../src/services/web.js';
import {createApplicationManager} from '../src/applications/manager.js';
import {writeUserData} from '../src/services/user-data.js';

const source=fileURLToPath(new URL('../../',import.meta.url)),root=await mkdtemp(join(tmpdir(),'ksf-incubation-browser-')),core=join(root,'.agents/core');
await mkdir(core,{recursive:true});
for(const path of ['runtime/src','runtime/package.json','runtime/web','applications/sdk/src','applications/sdk/package.json','abilities','docs','build.json','data-compatibility.json','distribution.json'])await cp(join(source,path),join(core,path),{recursive:true,filter:path=>!path.includes('/node_modules')&&!path.includes('/.vite/')});
await cp(join(source,'../../AGENTS.md'),join(root,'AGENTS.md'));
await mkdir(join(core,'applications/store'),{recursive:true});await writeFile(join(core,'applications/store/index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',name:'Isolated fixture',apps:[]}));
await mkdir(join(root,'.agents/user-data/communication'),{recursive:true});await writeFile(join(root,'.agents/user-data/communication/config.json'),JSON.stringify({schemaVersion:1,revision:1,enabled:false}));
writeUserData({root,namespace:'instance',ifMatch:'missing',values:{name:'灵台 · 隔离走查'}});
writeUserData({root,namespace:'incubation',ifMatch:'missing',values:{status:'completed'}});
const applications=createApplicationManager(root,{defaultSource:null});
const server=await startWebServer({root,port:0,capture:false,applications,webDirectory:join(core,'runtime/web')});
console.log(JSON.stringify({root,url:server.url,kind:'isolated-browser-walkthrough'}));
async function stop(){await server.close();await rm(root,{recursive:true,force:true});process.exit(0);}
process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
