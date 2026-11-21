import {resultSections} from './result-detail-model.js';

// These are views of recorded facts. Missing summaries and reviews stay missing.
export function detailReading(document,record){
  const m=document.metadata,parsed=resultSections(document.body,{aliases:m.kind==='milestone'?{'目标与范围':'目标','阶段目标':'目标'}:{}}),review=m.kind==='task'?document:(record.documents??[]).find(d=>d.metadata.kind==='review'&&d.path===m.review_ref?.path&&d.metadata.id===m.review_ref?.id&&d.metadata.subject?.id===m.id&&d.metadata.subject?.path===document.path);
  const rows=m.kind==='task'?m.verification?.results??[]:review?.metadata.criterion_results??[];
  const conditions=(m.criteria??[]).map(c=>({...c,review:rows.find(r=>r.criterion_id===c.id)??null}));
  return {...parsed,goalFromAlias:!!parsed.sections['目标']&&!resultSections(document.body).sections['目标'],original:parsed.original.replace(/^#[^\n]*(?:\n|$)/,'').trim()?parsed.original:'',hasSummary:Object.values(parsed.sections).some(Boolean),ended:['completed','cancelled'].includes(m.status),review,
    conditions,unmatched:rows.filter(r=>!conditions.some(c=>c.id===r.criterion_id)),
    passed:conditions.filter(c=>c.review?.result==='passed').length,
    unresolved:conditions.filter(c=>c.review?.result!=='passed'||!c.review?.evidence?.length),
    stale:(record.stale??[]).includes(m.id)||!!review&&(record.stale??[]).includes(review.metadata.id)};
}

/** An overview uses recorded summaries first; missing prose is never synthesized into a saved fact. */
export function scopeOverview(document,record,children=[]){
 const reading=detailReading(document,record),m=document.metadata;
 const completed=children.filter(d=>d.metadata.status==='completed'),open=children.filter(d=>!['completed','cancelled'].includes(d.metadata.status));
 const result=reading.sections['当前结果']||((m.result_refs??[]).length?'已有 '+m.result_refs.length+' 个本层结果入口。':completed.length?'原记录中 '+completed.length+' 个'+(m.kind==='project'?'里程碑':'任务')+'已完成：'+completed.map(d=>d.metadata.name).join('、')+'。':'尚未记录本层结果摘要，可从验收查看原始记录。');
 const gaps=reading.sections['未决与缺口']||(reading.stale?'验收依据已变化，需要复核原条件与证据。':!reading.conditions.length?'尚未记录本层完成条件。':reading.unresolved.length?'本层 '+reading.unresolved.length+' / '+reading.conditions.length+' 项条件尚缺完整验收记录。':'本层条件已有通过记录，仍需核对整体结论。');
 return {reading,result,gaps,next:m.next_action||'尚未记录下一步。',openCount:open.length,recordedCompletionCount:completed.length};
}

/** A late response cannot describe a different or newly saved reading baseline. */
export function externalRecordChanged(base,latest,current){
  return !!base?.etag&&base.etag===current?.etag&&base.project?.metadata.id===current?.project?.metadata.id
    &&latest?.project?.metadata.id===base.project.metadata.id&&!!latest.etag&&latest.etag!==current.etag;
}

export function createExternalRecordProbe({read,getCurrent,onState}){
  let alive=true,running=false;
  return {async probe(){
    if(!alive||running)return;const base=getCurrent();if(!base?.etag)return;running=true;
    try{const latest=await read();if(!alive)return;
      const current=getCurrent();if(base.etag!==current?.etag)return;
      onState({changed:externalRecordChanged(base,latest,current),checkedAt:new Date().toISOString(),error:''});
    }catch(error){if(alive)onState({error:error.message});}finally{running=false;}
  },dispose(){alive=false;}};
}
