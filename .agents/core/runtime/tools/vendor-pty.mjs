import {cp,rm,mkdir,readFile,writeFile,readdir,chmod} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
const runtime=fileURLToPath(new URL('../',import.meta.url)),source=resolve(process.argv[2]??join(runtime,'native-build/node_modules/node-pty')),target=join(runtime,'native/node-pty');
const manifest=JSON.parse(await readFile(join(source,'package.json'),'utf8'));if(manifest.version!=='1.1.0')throw Error('Expected pinned node-pty 1.1.0; use npm ci in runtime/native-build first.');
const text=await readFile(join(source,'lib/windowsPtyAgent.js'),'utf8');
const anchor='        this._conoutSocketWorker = new windowsConoutConnection_1.ConoutConnection(term.conout, this._useConptyDll);\n';
if(text.split(anchor).length!==2||text.includes('// KSF: close the worker'))throw Error('Pinned node-pty ConPTY worker source changed; review the compatibility patch.');
await mkdir(target,{recursive:true});for(const name of ['lib','prebuilds','package.json','LICENSE']){await rm(join(target,name),{recursive:true,force:true});await cp(join(source,name),join(target,name),{recursive:true,filter:path=>!/(?:\.pdb|\.map|\.d\.ts)$/.test(path)});}
await writeFile(join(target,'lib/windowsPtyAgent.js'),text.replace(anchor,anchor+"        // KSF: close the worker and input on ConPTY EOF without final data.\n        this._outSocket.once('close', function () { if (_this._inSocket) _this._inSocket.destroy(); _this._conoutSocketWorker.dispose(); });\n"));
for(const name of await readdir(join(target,'prebuilds')))if(name.startsWith('darwin-'))await chmod(join(target,'prebuilds',name,'spawn-helper'),0o755);
console.log('Vendored node-pty 1.1.0 into the workbench native boundary.');
