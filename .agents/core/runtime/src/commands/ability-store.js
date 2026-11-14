import {publishAbilitySource,verifyAbilitySource} from '../ability-store/publication.js';
import {readFileSync} from 'node:fs';
import {abilityStorePage,abilityStoreDetail,abilityStoreVersions,packAbilityStore,previewAbilityStore,mutateAbilityStore} from '../services/ability-store.js';
const help=`KSF ability-store\n\n  ksf ability-store publish --data <JSON: directory,source,publisher,packagePath or withdraw> --json\n  ksf ability-store verify-published --data <JSON: url,ids> --json\n  ksf ability-store catalog [--query TEXT] [--type TYPE] [--limit 1..40] [--cursor TOKEN] [--tab abilities|installed|updates|sources] [--json]\n  ksf ability-store detail --data '{"sourceId":"team","id":"partner.author.method"}' --json\n  ksf ability-store pack --data '{"name":"My abilities","items":[{"id":"partner.author.method","source":"user"}],"output":"/share/my.ksfabi"}' --json\n  ksf ability-store pack --data '{"path":"/repo","ids":["partner.author.method"],"output":"/share/team.ksfabi"}' --json\n  ksf ability-store preview --data '{"action":"import","packagePath":"/share/team.ksfabi"}' --json\n  ksf ability-store preview --from - --json\n  ksf ability-store <install|update|uninstall|rollback|copy|migrate|import|source-add|source-edit|source-toggle|source-remove|refresh|check> --from - --json\n\nUse structured JSON input. Mutations require operationId and ifMatch from catalog.\nInstall operations also require planDigest from preview (action names the operation).\n--dry-run previews installation operations without changing files.\n`;
// Adapter-level input errors are explicit; any other uncoded failure is an internal fault, not a usage error.
const invalidInput=message=>Object.assign(Error(message),{code:'INVALID_ARGUMENTS'});
const parseInput=text=>{try{return JSON.parse(text);}catch{throw invalidInput('输入需要有效的JSON。');}};
export async function runAbilityStoreCommand(args,root){
 let operation=args[0]??null;
 try{
  if(!args.length||args.length===1&&['--help','-h'].includes(operation))return {stdout:help,exitCode:0};
  let input={},options={},dryRun=false,json=false,from,inline;const seen=new Set();
  for(let i=1;i<args.length;i++){const key=args[i];if(seen.has(key))throw invalidInput('参数重复。');seen.add(key);if(key==='--json')json=true;else if(key==='--dry-run')dryRun=true;else if(['--query','--type','--limit','--cursor','--tab'].includes(key)){options[key.slice(2)]=args[++i];if(!options[key.slice(2)])throw invalidInput('参数需要一个值。');}else if(key==='--from'||key==='--data'){const value=args[++i];if(!value||value.startsWith('--'))throw invalidInput('参数需要一个值。');if(key==='--from')from=value;else inline=value;}else throw invalidInput('未知参数。');}
  if(from!==undefined&&inline!==undefined)throw invalidInput('--from与--data不能同时使用。');if(from!==undefined)input=parseInput(readFileSync(from==='-'?0:from,'utf8'));if(inline!==undefined)input=parseInput(inline);if(!input||typeof input!=='object'||Array.isArray(input))throw invalidInput('输入需要JSON对象。');
  if((operation==='import'||operation==='preview'&&input.action==='import'||dryRun&&operation==='import')&&input.packagePath){input.package=readFileSync(input.packagePath).toString('base64');delete input.packagePath;}
  let data;if(operation==='verify-published')data=await verifyAbilitySource(input);
  else if(operation==='publish'){if(input.packagePath){input.bytes=readFileSync(input.packagePath);delete input.packagePath;}data=publishAbilitySource(input);}
  else if(operation==='pack'){if(dryRun)throw invalidInput('pack不接受dry-run。');data=packAbilityStore(root,input);}
  else if(operation==='catalog'){if(from!==undefined||inline!==undefined||dryRun)throw invalidInput('catalog不接受操作输入。');data=await abilityStorePage(root,options);}
  else if(operation==='detail'){if(dryRun)throw invalidInput('detail不接受dry-run。');data=await abilityStoreDetail(root,input);if(!data)throw Object.assign(Error('能力不存在。'),{code:'ABILITY_STORE_NOT_FOUND'});}
  else if(operation==='versions')data=await abilityStoreVersions(root,{...input,...options});
  else if(operation==='preview'||dryRun)data=await previewAbilityStore(root,{...input,action:operation==='preview'?input.action:operation});
  else data=await mutateAbilityStore(root,operation,input);
  const result={ok:true,command:'ability-store',operation,data,errors:[]};return {stdout:JSON.stringify(result,null,json?undefined:2)+'\n',exitCode:0};
 }catch(e){return {stdout:JSON.stringify({ok:false,command:'ability-store',operation,data:e.details??null,errors:[{code:e.code??'INTERNAL_ERROR',message:e.message}]})+'\n',exitCode:e.code==='INVALID_ARGUMENTS'?2:1};}
}
