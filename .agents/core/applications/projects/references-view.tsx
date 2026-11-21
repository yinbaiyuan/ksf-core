import {Link} from '@ksf/sdk/link';
import {useMemo,useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {SearchField} from '@ksf/sdk/search-field';
import {InlineAlert} from '@ksf/sdk/inline-alert';
import {projectPlanView,projectReferenceKey} from './project-plan-model.js';
import {Block,Fold,labels} from './project-components';
import {milestoneTasks} from './result-detail-model.js';
export interface Reference {path?:string;url?:string;digest?:string;version?:string;name?:string;role?:string;[key:string]:any}
export function ReferenceLink({reference,onOpen,label}:{reference:Reference;onOpen:(r:Reference)=>void;label?:string}){
 const title=label??reference.name??reference.role??reference.path?.split('/').at(-1)??reference.url??'原件';
 if(reference.path)return <Button variant="text" size="small" onClick={()=>onOpen(reference)} title={reference.path+(reference.digest?' · '+reference.digest:'')}>{title}</Button>;
 try{const u=new URL(reference.url??'');if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return <span>无效引用</span>;return <Link href={u.href} target="_blank" rel="noopener noreferrer">{title}</Link>;}catch{return <span>原件入口缺失</span>;}
}
export function ReferencesView({record,subject,onOpen,onObject,mode='all'}:{mode?:'all'|'evidence'|'results';record:any;subject?:any;onOpen:(r:Reference)=>void;onObject:(path:string)=>void}){
 const [query,setQuery]=useState('');
 const view=useMemo(()=>projectPlanView(record),[record]);
 const scope=new Set(subject?[subject.path,...(subject.metadata.kind==='milestone'?milestoneTasks(subject,record).map((t:any)=>t.path):[])]:[]);
 const items=view.results.map((item:any)=>({...item,usages:item.usages.filter((u:any)=>!subject||scope.has(u.subject.path)||scope.has(u.source.path))})).filter((i:any)=>i.usages.length).filter((i:any)=>!query||[i.key,i.name,...i.usages.flatMap((u:any)=>[u.source.name,u.criterion?.text])].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const results=items.filter((item:any)=>item.usages.some((u:any)=>u.category==='result'));
 const evidence=new Map<string,{criterion:any;source:any;usages:any[]}>();
 for(const item of items)for(const usage of item.usages.filter((u:any)=>u.category==='evidence')){
  const key=usage.source.path+'|'+usage.criterion.id;
  if(!evidence.has(key))evidence.set(key,{criterion:usage.criterion,source:usage.source,usages:[]});
  evidence.get(key)!.usages.push({...usage,item,alsoResult:results.includes(item)});
 }
 return <div className="project-references"><SearchField label="查找引用、条件或来源" value={query} onValueChange={setQuery}/>
  {mode!=='evidence'&&<Block title="结果引用"><p className="project-muted">按原记录列出结果入口；引用本身不表示已验收或属于当前正式版本。</p>{results.length?results.map((item:any)=>{
   const usages=item.usages.filter((u:any)=>u.category==='result'),versions=[...new Map(usages.map((u:any)=>[projectReferenceKey(u.reference),u.reference])).values()] as Reference[];
   return <article key={item.key} className="project-reference-card"><h4>{item.name}</h4>{versions.map(ref=><div className="project-reference-version" key={projectReferenceKey(ref)}><ReferenceLink reference={ref} onOpen={onOpen}/><span className="project-muted">{ref.digest?'固定版本 · '+ref.digest.slice(0,12):ref.version?'记录版本 · '+ref.version:'当前原件'}</span></div>)}
    <Fold title="来源与用途">{usages.map((u:any)=><p key={u.signature}><Button variant="text" onClick={()=>onObject(u.source.path)}>{u.source.name}</Button> · {u.role} · result_refs</p>)}</Fold>
    {item.usages.some((u:any)=>u.category==='evidence')&&<p className="project-muted">同时用于验收条件；固定依据在验收页按条件核对。</p>}
   </article>;
  }):<p className="project-muted">尚未记录结果引用；代码能力或运行入口也可以是结果，无需额外生成文件。</p>}</Block>}
  {mode!=='results'&&<Block title="验收证据"><p className="project-muted">按条件读取复核记录。固定版本只读，无法读取时保留缺口。</p>{[...evidence].map(([key,{criterion,source,usages}])=><Fold key={key} title={criterion.text+' · '+(labels[criterion.result]??criterion.result)}>
   <p>来源：<Button variant="text" onClick={()=>onObject(source.path)}>{source.name}</Button></p><p>复核者：{criterion.reviewer||'未记录'} · {criterion.reviewedAt||'未记录时间'}</p>
   <p>{criterion.effective?'当前有效通过记录':criterion.result==='passed'?'原记录通过，当前有效性需核对':'按原记录核对'}{usages.some(u=>u.stale)?' · 依据待复核':''}</p>
   {usages.map(u=><div key={u.signature} className="project-evidence-link"><ReferenceLink reference={u.reference} label={u.item.name} onOpen={onOpen}/><span>{u.reference.digest?'固定版本 · '+u.reference.digest:u.reference.version?'记录版本 · '+u.reference.version:'原记录未固定版本'}{u.alsoResult?' · 同一结果的证据用途':''}</span></div>)}
   {usages.some(u=>u.reviewStatus==='draft')&&<InlineAlert tone="warning" heading="复盘仍是草稿">草稿中的通过记录不代表正式验收通过。</InlineAlert>}
  </Fold>)}{!evidence.size&&<p className="project-muted">尚无条件证据记录。</p>}</Block>}
 </div>;
}
