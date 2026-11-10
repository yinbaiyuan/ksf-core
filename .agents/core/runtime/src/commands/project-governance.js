import {parseOptions,optionSpecs,hasJsonFlag} from '../shared/options.js';
import {invalid,MetadataError} from '../metadata/errors.js';
import {parseInput} from '../metadata/input.js';
import {readInputFile} from '../services/metadata.js';
import {errorItem} from '../services/projects.js';
import {projectGovernance} from '../services/project-governance.js';

const help='KSF project governance\n\n  ksf project governance read|check|apply|migrate|create-task|renumber|reorganize|context-list <name> [--scope current|archived] [--from <file>|--data <JSON>] [--dry-run] [--json]\n  ksf project governance recover <operation-id> [--dry-run] [--json]\n\nread/check/context-list never write. read returns numbered context entries. context-list lists one context package directory using {path}. apply uses {operationId,ifMatch,changes:[{path,ifMatch,metadata?,body?,contentBase64?}]}.\nsetParent:{child:{id,path},parent:{id,path}|null} updates both sides.\nmigrate without approvalDigest only previews; execute the reviewed mapping using approvalDigest and operationId.\ncreate-task previews/commits {operationId,milestone:{id,path},stage,name,ifMatch?,owner?,criteria?,next_action?,goal_ids?,depends_on?,commitment?,priority?,work_type?,body?}; supply preview ifMatch to commit. Preview does not reserve a code; commit assigns under lock. New letter-stage projects only; no legacy migration.\nrenumber previews/commits {operationId,ifMatch,actor,reason,milestones:[{id,task_stages,tasks:[{id,code}]}]}; commit uses preview ifMatch. Stable IDs and old links are retained.\nreorganize preserves the project ID and archives the complete material tree using {operationId,ifMatch,snapshotPath,newProjects,changes,referenceChanges?}; preview with --dry-run.\n';
export function runProjectGovernanceCommand(args,root){
  if(!args.length||args.length===1&&['--help','-h'].includes(args[0]))return {stdout:help,exitCode:0};
  const result={ok:false,command:'project',operation:'governance',data:null,errors:[]};let exitCode=1;
  try{
    const [operation,...rest]=args;if(!['read','check','apply','migrate','create-task','renumber','reorganize','context-list','recover'].includes(operation))invalid('Expected governance read/check/apply/migrate/create-task/renumber/reorganize/context-list/recover.');
    const parsed={operation};parseOptions(rest,{result:parsed,options:optionSpecs(['scope','json','help',...(['read','recover'].includes(operation)?[]:['data','from']),...(['apply','migrate','create-task','renumber','reorganize','recover'].includes(operation)?['dry-run']:[])]),invalid,target:x=>{if(parsed.name!==undefined)invalid('Only one target is allowed.');parsed.name=x;}});
    if(parsed.help){if(rest.length!==1)invalid('Use --help alone.');return {stdout:help,exitCode:0};}
    if(parsed.name===undefined||parsed.data!==undefined&&parsed.from!==undefined)invalid('Specify one target and at most one input.');
    const data=parsed.from!==undefined?readInputFile(root,parsed.from):parsed.data!==undefined?parseInput(parsed.data):undefined;
    const out=projectGovernance({...parsed,root,data});result.data=out.data;result.errors=out.errors;result.ok=!out.errors.length;exitCode=result.ok?0:1;
  }catch(e){result.errors=[errorItem(e)];exitCode=e instanceof MetadataError?e.exitCode:1;}
  return {stdout:JSON.stringify(result,null,hasJsonFlag(args)?0:2)+'\n',exitCode};
}
