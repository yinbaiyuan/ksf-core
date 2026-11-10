import {readFileSync} from 'node:fs';
import {abilityStorePage,abilityStoreDetail,abilityStoreVersions,packAbilityStore,previewAbilityStore,mutateAbilityStore} from '../services/ability-store.js';
const help=`KSF ability-store\n\n  ksf ability-store catalog [--query TEXT] [--type TYPE] [--limit 1..40] [--cursor TOKEN] [--tab abilities|installed|updates|sources] [--json]\n  ksf ability-store detail --data '{"sourceId":"team","id":"partner.author.method"}' --json\n  ksf ability-store pack --data '{"path":"/repo","ids":["partner.author.method"],"output":"/share/team.ksfability"}' --json\n  ksf ability-store preview --data '{"action":"import","packagePath":"/share/team.ksfability"}' --json\n  ksf ability-store preview --from - --json\n  ksf ability-store <install|update|uninstall|copy|migrate|import|source-add|source-edit|source-toggle|source-remove|refresh|check> --from - --json\n\nUse structured JSON input. Mutations require operationId and ifMatch from catalog.\nInstall operations also require planDigest from preview (action names the operation).\n--dry-run previews installation operations without changing files.\n`;
export async function runAbilityStoreCommand(args,root){
 let operation=args[0]??null;
 try{
  if(!args.length||args.length===1&&['--help','-h'].includes(operation))return {stdout:help,exitCode:0};
  let input={},options={},dryRun=false,json=false,from,inline;const seen=new Set();
  for(let i=1;i<args.length;i++){const key=args[i];if(seen.has(key))throw Error('参数重复。');seen.add(key);if(key==='--json')json=true;else if(key==='--dry-run')dryRun=true;else if(['--query','--type','--limit','--cursor','--tab'].includes(key)){options[key.slice(2)]=args[++i];if(!options[key.slice(2)])throw Error('参数需要一个值。');}else if(key==='--from'||key==='--data'){const value=args[++i];if(!value||value.startsWith('--'))throw Error('参数需要一个值。');if(key==='--from')from=value;else inline=value;}else throw Error('未知参数。');}
  if(from!==undefined&&inline!==undefined)throw Error('--from与--data不能同时使用。');if(from!==undefined)input=JSON.parse(readFileSync(from==='-'?0:from,'utf8'));if(inline!==undefined)input=JSON.parse(inline);if(!input||typeof input!=='object'||Array.isArray(input))throw Error('输入需要JSON对象。');
  if((operation==='import'||operation==='preview'&&input.action==='import'||dryRun&&operation==='import')&&input.packagePath){input.package=readFileSync(input.packagePath).toString('base64');delete input.packagePath;}
  let data;if(operation==='pack'){if(dryRun)throw Error('pack不接受dry-run。');data=packAbilityStore(root,input);}
  else if(operation==='catalog'){if(from!==undefined||inline!==undefined||dryRun)throw Error('catalog不接受操作输入。');data=await abilityStorePage(root,options);}
  else if(operation==='detail'){if(dryRun)throw Error('detail不接受dry-run。');data=await abilityStoreDetail(root,input);if(!data)throw Object.assign(Error('能力不存在。'),{code:'ABILITY_STORE_NOT_FOUND'});}
  else if(operation==='versions')data=await abilityStoreVersions(root,{...input,...options});
  else if(operation==='preview'||dryRun)data=await previewAbilityStore(root,{...input,action:operation==='preview'?input.action:operation});
  else data=await mutateAbilityStore(root,operation,input);
  const result={ok:true,command:'ability-store',operation,data,errors:[]};return {stdout:JSON.stringify(result,null,json?undefined:2)+'\n',exitCode:0};
 }catch(e){return {stdout:JSON.stringify({ok:false,command:'ability-store',operation,data:e.details??null,errors:[{code:e.code??'INVALID_ARGUMENTS',message:e.message}]})+'\n',exitCode:e.code?1:2};}
}
