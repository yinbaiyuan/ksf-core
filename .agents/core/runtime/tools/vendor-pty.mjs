import {cp,rm,mkdir,readFile,writeFile,readdir,chmod} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
const runtime=fileURLToPath(new URL('../',import.meta.url)),source=resolve(process.argv[2]??join(runtime,'native-build/node_modules/node-pty')),target=join(runtime,'native/node-pty');
const manifest=JSON.parse(await readFile(join(source,'package.json'),'utf8'));if(manifest.version!=='1.1.0')throw Error('Expected pinned node-pty 1.1.0; use npm ci in runtime/native-build first.');
await mkdir(target,{recursive:true});for(const name of ['lib','prebuilds','package.json','LICENSE']){await rm(join(target,name),{recursive:true,force:true});await cp(join(source,name),join(target,name),{recursive:true,filter:path=>!/(?:\.pdb|\.map|\.d\.ts)$/.test(path)});}
for(const name of await readdir(join(target,'prebuilds')))if(name.startsWith('darwin-'))await chmod(join(target,'prebuilds',name,'spawn-helper'),0o755);
console.log('Vendored node-pty 1.1.0 into the workbench native boundary.');
