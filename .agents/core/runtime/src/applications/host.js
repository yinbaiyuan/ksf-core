// Application modules execute only in disposable child processes.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';
let application, cliReady, cliDefinition, cliDirectory, closing=false, next=0;
const callContext=new AsyncLocalStorage();
const pending=new Map();
const send=value=>{if(process.connected)process.send(value);};
const errorFrom=value=>Object.assign(new Error(value.message),value);
function service(service,method,params=[]){
  const id=++next;
  return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});send({type:'service',id,service,method,params,caller:callContext.getStore()});});
}
async function close(){
  if(closing)return;closing=true;
  const deadline=setTimeout(()=>process.exit(0),1500);deadline.unref();
  try{await application?.dispose?.();}finally{clearTimeout(deadline);process.exit(0);}
}
process.on('disconnect',()=>{for(const item of pending.values())item.reject(new Error('应用宿主已断开。'));pending.clear();void close();});
process.on('SIGTERM',close);
process.on('message',async message=>{
  if(message.type==='service-result'){
    const item=pending.get(message.id);if(!item)return;pending.delete(message.id);message.error?item.reject(errorFrom(message.error)):item.resolve(message.value);return;
  }
  if(message.type==='init'){
    try{
      const module=await import(pathToFileURL(join(message.directory,message.manifest.backend.entry)).href);
      if(typeof module.activate!=='function')throw new Error('后端必须导出 activate(context)。');
      const context={sdkVersion:message.manifest.sdkVersion,appId:message.manifest.id,version:message.manifest.version,dataDirectory:message.dataDirectory,workspace:message.workspace,services:{call:service},storage:{read:name=>service('storage','read',[name]),write:(name,text,options)=>service('storage','write',[name,text,options])}};
      if(context.sdkVersion>=2){
        context.services={call:service};
        context.locks={async run(key,action){const token=await service('runtime','lock',[key]);try{return await action();}finally{await service('runtime','unlock',[token]);}}};
        context.tasks={async run(action){const token=await service('runtime','retain');try{return await action();}finally{await service('runtime','release',[token]);}}};
      }
      if(context.sdkVersion===3){
        context.background={retain:input=>service('background','retain',[input]),release:key=>service('background','release',[key]),list:()=>service('background','list')};
        context.messages=Object.fromEntries(['send','status','reconcile','cancel','inbox','read','readPart','registerFile'].map(method=>[method,(...args)=>service('messages',method,args)]));
        context.peers={list:()=>service('peers','list')};
      }
      application=await module.activate(context);
      if(typeof application?.call!=='function')throw new Error('后端必须提供 call(method, params)。');
      if(message.manifest.background===true){if(typeof application.startBackground!=='function')throw new Error('后台应用必须提供 startBackground()。');await application.startBackground();}
      else if(message.resumePersistent&&typeof application.startBackground==='function')await application.startBackground();
      cliDefinition=message.manifest.cli;cliDirectory=message.directory;
      if(message.manifest.activation?.messages&&typeof application.onMessage!=='function')throw new Error('消息激活应用必须提供 onMessage(event)。');
      send({type:'ready'});
    }catch(error){send({type:'failed',message:error.message});setTimeout(close,10);}
  }else if(['call','cli','message'].includes(message.type)){
    try{if(!application||closing)throw new Error('应用尚未就绪。');let value;
      if(message.type==='message'){if(typeof application.onMessage!=='function')throw new Error('应用未提供消息处理入口。');value=await application.onMessage(message.params);}
      else if(message.type==='cli'){
        if(!cliDefinition?.commands.some(command=>command.id===message.method))throw new Error('应用未声明此 CLI 命令。');
        if(!cliReady)cliReady=(async()=>{const module=await import(pathToFileURL(join(cliDirectory,cliDefinition.entry)).href);if(typeof module.createCLI!=='function')throw new Error('CLI 入口必须导出 createCLI(context)。');
          const cli=await module.createCLI({invoke(method,params){const caller=callContext.getStore();if(!caller)throw new Error('CLI 初始化期间不能执行业务。');return application.call(method,params,caller);}});if(typeof cli?.execute!=='function')throw new Error('CLI 必须返回 execute(commandId,input,caller)。');return cli;})();
        const cli=await cliReady;
        value=await callContext.run(message.caller,()=>cli.execute(message.method,message.params,message.caller));
      }else value=await callContext.run(message.caller,()=>application.call(message.method,message.params,message.caller));
      send({type:'result',id:message.id,value});}
    catch(error){send({type:'result',id:message.id,error:{code:error.code??'APP_CALL_FAILED',message:error.message,status:error.status,data:error.data}});}
  }else if(message.type==='close')await close();
});
