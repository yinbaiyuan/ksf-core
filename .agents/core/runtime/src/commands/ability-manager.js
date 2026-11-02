import {migrateAbilityManager} from '../migrations/ability-manager.js';
export function runAbilityManagerCommand(args,root) {
  const help='ksf ability-manager migrate (--dry-run | --apply) [--json]\nMigrate the former Core object designer identity and current state; preserve historical originals.\n';
  if(args.length===1 && ['--help','-h'].includes(args[0]) || args[0]==='migrate' && args.length===2 && ['--help','-h'].includes(args[1]))return {stdout:help,exitCode:0};
  const result={ok:false,command:'ability-manager',operation:'migrate',data:null,errors:[]};let exitCode=0;
  try {
    const flags=args.slice(1);
    if(args[0]!=='migrate' || flags.some(f=>!['--json','--dry-run','--apply'].includes(f)) || new Set(flags).size!==flags.length || flags.includes('--dry-run')===flags.includes('--apply'))throw Object.assign(new Error(help),{code:'INVALID_ARGUMENTS',exitCode:2});
    result.data=migrateAbilityManager({root,apply:flags.includes('--apply')});result.ok=true;
  }catch(e){result.errors=[{code:e.code??'MIGRATION_FAILED',message:e.message,...e.details}];exitCode=e.exitCode??1;}
  return {stdout:JSON.stringify(result,null,args.includes('--json')?undefined:2)+'\n',exitCode};
}
