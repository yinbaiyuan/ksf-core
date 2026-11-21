import {randomId} from '@ksf/sdk/random-id';
import {RunController,createDesktopRunAdapter,SaveController,createSessionSaveAdapter,projectFileResource} from '@ksf/sdk/controllers';
import {createFileTransport} from '@ksf/sdk/files';
import {createConversationWorkspace} from './conversation-model.js';
export function createConversationPanel(sdk,renderMarkdown,publish,{pickFile}={}){
 const node=document.createElement('section');node.className='kp-conversation';node.setAttribute('aria-label','Codex Desktop 项目对话');
 const model=createConversationWorkspace(sdk,{RunController,createDesktopRunAdapter,SaveController,createSessionSaveAdapter,files:{...createFileTransport(sdk),pickFile},projectFileResource,randomId,
  async readLegacy(project){
   const session=await sdk.getSession(),key=`${sdk.appId}:codex-draft:${session.instanceId??location.origin}:${sdk.surfaceId??sdk.instanceId}:codex-draft:${project.scope}:${project.name}`;
   // Keep the old original until the managed checkpoint is confirmed. Reads never delete it.
   const saved=sessionStorage.getItem(key);if(!saved)return null;try{return JSON.parse(saved);}catch{throw Error('旧对话草稿无法读取，原件已保留。');}
  }});
 publish({node,model,renderMarkdown});
 return {node,select:(project,options)=>model.select(project,options),attach:taskId=>model.attach(taskId),prefill:text=>model.prefill(text),setActive:value=>model.setActive(value),flush:()=>model.flush(),getGeneration:()=>model.getGeneration(),getLocation:()=>model.getLocation(),dispose(){model.dispose();node.remove();}};
}
