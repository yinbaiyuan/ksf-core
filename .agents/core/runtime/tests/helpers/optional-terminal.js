// A synthetic optional package exercises the host PTY contract without a
// bundled scene-app mirror or a dependency on the developer's local checkout.
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {encodePackage,checksum} from '../../src/applications/protocol.js';
export function terminalRelease(){
 const manifest={schemaVersion:1,sdkVersion:1,id:'com.ksf.terminal',name:'Terminal compatibility fixture',description:'Synthetic optional PTY client',version:'0.1.0',minCoreVersion:'0.1.0',dataStores:[],permissions:['shell','filesystem','network'],backend:{runtime:'node',lifecycle:'on-demand',entry:'backend/index.mjs'},window:{entry:'frontend/index.js',multiInstance:true}};
 const file=text=>{const bytes=Buffer.from(text);return{content:bytes.toString('base64'),sha256:checksum(bytes),mode:420};};
 const bytes=encodePackage(manifest,{'backend/index.mjs':file("export function activate(context){const methods=new Set(['create','list','read','write','resize','close']);return{call(method,input={}){if(!methods.has(method))throw Error('Unknown terminal operation');return context.services.call('terminal',method,[input]);}};}"),'frontend/index.js':file('export function mount(){}')});
 return{bytes,entry:{manifest,package:{url:'terminal.ksfapp',size:bytes.length,sha256:checksum(bytes)}}};
}
export async function publishTerminal(directory){const release=terminalRelease();await mkdir(directory,{recursive:true});await writeFile(join(directory,release.entry.package.url),release.bytes);await writeFile(join(directory,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[release.entry]}));return release;}
