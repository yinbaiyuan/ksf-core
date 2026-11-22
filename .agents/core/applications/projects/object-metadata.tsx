import {Button} from '@ksf/sdk/button';
import {DescriptionList} from '@ksf/sdk/description-list';
import {Form} from '@ksf/sdk/form';
import {Fields,Fold,Status,fieldLabels,labels} from './project-components';
import {ReferenceLink} from './references-view';
import {objectMetadata,objectMetadataEdit} from './object-file-model.js';

const captions:Record<string,string>={...fieldLabels,updated:'更新时间',created:'创建时间',governance_schema:'数据格式',kind:'对象类型',project:'所属项目',milestone:'所属里程碑',subject:'复盘对象',review_ref:'复盘原件',verification:'复核记录',criterion_results:'逐项复核记录',milestones:'里程碑索引',tasks:'任务索引',task_code:'任务编号'};
export function ObjectMetadata({document,model,onOpen,onObject,editing,readOnly}:{document:any;model:any;onOpen:(reference:any)=>void;onObject:(path:string)=>void;editing:boolean;readOnly:boolean}){
 const m=document.metadata,fields=objectMetadata(m),record=model.getSnapshot().record;
 function change(next:any){const edit=objectMetadataEdit(m,next);model.edit(document.path,(d:any)=>{d.metadata=edit.metadata;},{verification:edit.verification});}
 const value=(item:any,key:string):any=>{
  if(item===null||item===undefined||item==='')return <span className="project-muted">—</span>;
  if(key==='status')return <Status value={String(item)}/>;
  if(typeof item==='boolean')return item?'是':'否';
  if(typeof item!=='object')return <span className="project-property-text">{['kind','commitment','priority','work_type','mode','phase','outcome','result','state','resume_status'].includes(key)?labels[String(item)]??String(item):String(item)}</span>;
  if(Array.isArray(item))return item.length?<Fold lazy title={'展开 '+item.length+' 项'}>{()=><ol className="project-property-list">{item.map((entry:any,index:number)=><li key={index}>{value(entry,key)}</li>)}</ol>}</Fold>:<span className="project-muted">空列表</span>;
  const target=item.id&&[record.project,...record.documents].find((d:any)=>d.path===item.path&&d.metadata.id===item.id);
  if(target)return <><Button size="small" variant="text" onClick={()=>onObject(target.path)}>{target.metadata.name}</Button><Fold lazy title="引用属性">{()=>properties(Object.entries(item).map(([key,value])=>({key,value})))}</Fold></>;
  if(item.path||item.url)return <><ReferenceLink reference={item} onOpen={onOpen}/>{Object.keys(item).length>1&&<Fold lazy title="引用属性">{()=>properties(Object.entries(item).map(([key,value])=>({key,value})))}</Fold>}</>;
  return properties(Object.entries(item).map(([key,value])=>({key,value})));
 };
 const properties=(entries:any[])=> <DescriptionList columns={1} size="small" items={entries.map(({key,value:item})=>({id:key,label:captions[key]??key,content:value(item,key)}))}/>;
 return editing?<Form disabled={readOnly} className="project-editor" onCommit={()=>model.save()} onCompositionStart={()=>model.composition(true)} onCompositionEnd={()=>model.composition(false)} onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'&&!event.nativeEvent.isComposing){event.preventDefault();void model.save();}}}><Fields value={Object.fromEntries(fields.primary.map(({key,value}:any)=>[key,value]))} disabled={readOnly} options={{status:record.stateModel?.states?.[m.kind]??[m.status]}} onChange={next=>change(next)}/><Fold title={'其他属性（'+fields.other.length+'）'}><Fields value={Object.fromEntries(fields.other.map(({key,value}:any)=>[key,value]))} disabled={readOnly} options={{status:record.stateModel?.states?.[m.kind]??[m.status]}} onChange={next=>change(next)}/></Fold></Form>:<div className="project-object-properties">{properties(fields.primary)}<Fold lazy title={'其他属性（'+fields.other.length+'）'}>{()=>properties(fields.other)}</Fold></div>;
}
