import {resolve} from 'node:path';
import {readMaterial,copyMaterial} from '../src/shared/material-files.js';
const args=process.argv.slice(2),operation=args.shift(),options={prefixes:[]};
try {
  for(let i=0;i<args.length;i++) {
    const flag=args[i];
    if(flag==='--json')continue;
    if(flag==='--dry-run'){if(options.dryRun)throw Error('Duplicate --dry-run');options.dryRun=true;continue;}
    if(!['--root','--source','--destination','--if-match','--scope'].includes(flag)||!args[i+1]||args[i+1].startsWith('--'))throw Error('Expected read/copy/move --root <root> --source <relative path> --scope <allowed directory> [--scope ...] [--destination <relative path> --if-match <SHA256> --dry-run] [--json]');
    const value=args[++i],key={'--if-match':'ifMatch'}[flag]??flag.slice(2);
    if(flag==='--scope')options.prefixes.push(value);else {if(options[key]!==undefined)throw Error('Duplicate '+flag);options[key]=value;}
  }
  if(!['read','copy','move'].includes(operation)||!options.root||!options.source||!options.prefixes.length||operation!=='read'&&(!options.destination||!options.ifMatch))throw Error('Missing required operation, root, source, scope or destination baseline.');
  const root=resolve(options.root);
  const data=operation==='read' ? (({path,sha256,bytes})=>({path,sha256,byteLength:bytes.length}))(readMaterial(root,options.source,options)) : copyMaterial(root,{...options,move:operation==='move'});
  process.stdout.write(JSON.stringify({ok:true,operation,data,errors:[]})+'\n');
}catch(e){process.stdout.write(JSON.stringify({ok:false,operation,data:null,errors:[{code:e.code??'INVALID_ARGUMENTS',message:e.message,...e.details}]})+'\n');process.exitCode=1;}
