import {readJSON} from '../communication/contracts.js';
import {join} from 'node:path';
import {liveIdentity} from '../services/service-lock.js';
import {ensureService,serviceStatus,serviceLogs,configureAutostart,stopService,openWorkbench,readServicePolicy,serviceDoctor} from '../services/service-manager.js';
import {runService} from '../services/service-entry.js';
const help='KSF 后台服务\n\nksf service start|stop|restart|status|logs|doctor [--json] [--force]\nksf service autostart enable|disable|status [--json]\nksf open [--json]\nksf service run [--reason login|manual] [--json]\n';
export async function runServiceCommand(args,root,{open=false}={}){
  let operation=open?'open':args[0];
  if(!operation||args.includes('--help'))return {stdout:help,exitCode:0};
  try{let data;const allowed=new Set(['--json','--force','--reason']);for(let i=open?0:1;i<args.length;i++){const v=args[i];if(operation==='autostart'&&i===1)continue;if(!allowed.has(v))throw Object.assign(Error('无效服务参数。'),{code:'INVALID_ARGUMENTS'});if(v==='--reason'){if(!args[++i])throw Object.assign(Error('缺少启动原因。'),{code:'INVALID_ARGUMENTS'});}}
    if(operation==='run'){const i=args.indexOf('--reason'),request=await readJSON(join(root,'.agents/runtime-data/service/start-request.json'),null),active=liveIdentity(request?.parent);return {stdout:'',exitCode:await runService(root,{port:(await readServicePolicy(root)).port,reason:active?request.reason:i<0?'manual':args[i+1],attemptId:active?request.id:undefined})};}
    if(operation==='open')data=await openWorkbench(root);
    else if(operation==='start')data=await ensureService(root,{reason:'manual'});
    else if(operation==='stop')data=await stopService(root,{force:args.includes('--force')});
    else if(operation==='restart'){await stopService(root,{force:args.includes('--force')});data=await ensureService(root,{reason:'restart'});}
    else if(operation==='status')data=await serviceStatus(root);
    else if(operation==='logs')data=await serviceLogs(root);
    else if(operation==='doctor')data=await serviceDoctor(root);
    else if(operation==='autostart'){const action=args[1];if(!['enable','disable','status'].includes(action))throw Object.assign(Error('需要 enable、disable 或 status。'),{code:'INVALID_ARGUMENTS'});data=action==='status'?await readServicePolicy(root):await configureAutostart(root,action==='enable');}
    else throw Object.assign(Error('未知服务操作。'),{code:'INVALID_ARGUMENTS'});
    return {stdout:JSON.stringify({ok:true,command:'service',operation,data,errors:[]})+'\n',exitCode:0};
  }catch(e){return {stdout:JSON.stringify({ok:false,command:'service',operation,data:null,errors:[{code:e.code??'SERVICE_FAILED',message:e.message,...(e.data?{data:e.data}:{})}]})+'\n',exitCode:e.code==='INVALID_ARGUMENTS'?2:1};}
}
