import {mergeProjectPlans} from './plan-merge.js';
export const documentValue=d=>({metadata:structuredClone(d.metadata),body:d.body});
export function adoptSavedDocument(draft,sent,latest){
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const unchanged=same(draft.value,{metadata:sent.metadata,body:sent.body});
  draft.base=structuredClone(latest);
  if(unchanged){
    // Mounted inputs still refer to unchanged criteria, stages and result objects.
    for(const [key,value]of Object.entries(latest.metadata))if(!same(draft.value.metadata[key],value))draft.value.metadata[key]=structuredClone(value);
    for(const key of Object.keys(draft.value.metadata))if(!(key in latest.metadata))delete draft.value.metadata[key];
    draft.value.body=latest.body;draft.verificationChanged=false;
  }else draft.value.metadata.updated=latest.metadata.updated;
  return unchanged;
}
export function evidenceReferences(metadata){
  const rows=metadata.kind==='task'?metadata.verification?.results:metadata.kind==='review'?metadata.criterion_results:[];
  return (Array.isArray(rows)?rows:[]).flatMap(r=>Array.isArray(r.evidence)?r.evidence:[]).filter(e=>{
    if(typeof e?.path==='string')return true;
    try{const u=new URL(e?.url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}
  }).map(e=>({...e,role:'验收证据'}));
}
export function mergeDocuments(drafts,latest,choices={}){
  const merged=[],conflicts=[];
  for(const draft of drafts){
    const current=latest.find(d=>d.path===draft.path),base=draft.base?documentValue(draft.base):undefined;
    const selection=Object.fromEntries(Object.entries(choices).filter(([k])=>k.startsWith(draft.path+'\n')).map(([k,v])=>[k.slice(draft.path.length+1),v]));
    const result=mergeProjectPlans(base,draft.value,current?documentValue(current):undefined,selection);
    for(const c of result.conflicts)conflicts.push({...c,key:draft.path+'\n'+c.key,document:draft.path});
    if(result.plan!==undefined)merged.push({...draft,base:current??null,value:result.plan});
  }
  return {drafts:merged,conflicts};
}
export function criteriaContent(criteria){
  const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
  return JSON.stringify(stable(criteria??[]));
}
export async function criteriaDigest(criteria){
  const bytes=new TextEncoder().encode(criteriaContent(criteria)),out=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(out)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
