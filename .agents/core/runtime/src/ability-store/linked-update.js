import {prepareHTTP} from './http.js';
import {contentFiles,contentIdentity,groupsOf} from './content.js';
import {compositeImportPlan} from './composite.js';
import {fault} from '../store-catalog/protocol.js';

// Fetch only the reverse dependents of changed exact versions, through their
// already selected update origins. Personal definitions are never fetched away.
export async function linkedHTTPPlan(root,state,input,first){
 const deliveries=new Map([[input.sourceId,first]]),requests=new Map([[input.sourceId,new Set(input.ids??(input.id?[input.id]:[]))]]);
 const merge=()=>{
  const objects=new Map(),groups=new Map(),roots=new Set();
  for(const value of deliveries.values())for(const id of value._composite.roots)roots.add(id);
  for(const value of deliveries.values())for(const group of groupsOf(value._composite))for(const object of group.objects){
   const identity=contentIdentity(group,object),prior=objects.get(object.id);
   if(prior&&(prior.object.version!==object.version||prior.identity!==identity))throw fault('ABILITY_STORE_DEPENDENCY_CONFLICT','联动更新要求不同版本或内容：'+object.id);
   if(!prior||state.installed[group.sourceId]?.objects.some(o=>o.id===object.id))objects.set(object.id,{object,group,identity});
  }
  for(const {object,group} of objects.values()){
   let target=groups.get(group.sourceId);if(!target){target={sourceId:group.sourceId,sourceName:group.sourceName,objects:[],files:new Map()};groups.set(group.sourceId,target);}
   target.objects.push({...object,dependencies:object.dependencies.map(d=>({...d,source:d.source==='system'?'system':objects.get(d.id)?.group.sourceId??d.source}))});
   for(const file of contentFiles(group,object)){const prior=target.files.get(file.path);if(prior&&prior.sha256!==file.sha256)throw fault('ABILITY_STORE_RESOURCE_CONFLICT','联动更新共享资源内容冲突。');target.files.set(file.path,file);}
  }
  return {protocol:'ksf-ability-package-v2',sourceId:input.sourceId,roots:[...roots],groups:[...groups.values()].map(g=>({...g,files:[...g.files.values()]}))};
 };
 let packet;
 for(;;){packet=merge();const candidates=new Map(packet.groups.flatMap(g=>g.objects.map(o=>[o.id,o]))),needed=new Map();
  for(const [sourceId,installed] of Object.entries(state.installed))for(const object of installed.objects){if(candidates.has(object.id))continue;if(!object.dependencies.some(d=>d.source!=='system'&&candidates.has(d.id)&&candidates.get(d.id).version!==d.version))continue;
   const source=state.sources.find(s=>s.id===sourceId);if(source?.kind!=='http'||!source.enabled)throw Object.assign(fault('ABILITY_STORE_EXTERNAL_DEPENDENCY','联动能力的更新来源不可用，请保留旧版或显式调整引用。'),{details:{id:object.id,sourceId}});
   if(!needed.has(sourceId))needed.set(sourceId,[]);needed.get(sourceId).push(object.id);
  }
  if(!needed.size)break;
  for(const [sourceId,ids] of needed){let selected=requests.get(sourceId);if(!selected){selected=new Set();requests.set(sourceId,selected);}for(const id of ids)selected.add(id);const value=await prepareHTTP(root,state,{action:'update',sourceId,ids:[...selected]});
   if(!value._composite)throw fault('ABILITY_STORE_EXTERNAL_DEPENDENCY','跨源联动需要可核对完整闭包的能力包，请先更新该来源发布格式。');deliveries.set(sourceId,value);
  }
 }
 const result=compositeImportPlan(root,state,packet,input);result.action=input.action;
 for(const part of result.plans)if(deliveries.has(part.sourceId))part.origin=deliveries.get(part.sourceId)._delivery;
 return result;
}
