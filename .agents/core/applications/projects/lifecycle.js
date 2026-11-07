import {randomId} from '@ksf/sdk/random-id';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const button=(text,fn,cls='kp-text-button')=>{const n=el('button',cls,text);n.type='button';n.addEventListener('click',fn);return n;};
export function createProjectLifecycle({sdk,hasDrafts,discardDrafts,onChanged,onPrepare}){
  const node=el('section','pg-lifecycle');node.hidden=true;node.setAttribute('aria-label','项目归档与恢复');
  let selected,returnFocus,projects=[],chosen=new Set(),reason='',actor='本地用户',preview=null,pending=null,busy=false,error='',alive=true,generation=0;
  const storage=sdk.appId+':lifecycle:'+sdk.instanceId;
  function persist(){try{if(pending)sessionStorage.setItem(storage,JSON.stringify({selected,projects,chosen:[...chosen],reason,actor,preview,pending}));else sessionStorage.removeItem(storage);}catch{error='操作回执暂时无法保留，请保留本窗口核对结果。';}}
  const drafts=()=>hasDrafts(targetRows());
  const operation=()=>selected.scope==='current'?'archive':'restore',title=()=>operation()==='archive'?'归档项目':'恢复到当前';
  const targetRows=()=>projects.filter(p=>p.scope===selected.scope&&chosen.has(p.name));
  function field(label,value,change){const wrap=el('label','pm-field'),input=el('input');input.value=value;input.disabled=busy||!!pending;input.addEventListener('input',()=>{change(input.value);preview=null;node.querySelector('[data-transition-commit]')?.remove();});wrap.append(el('span','',label),input);return wrap;}
  async function inspect(){if(busy||pending)return;error='';if(drafts()){error='本窗口有未保存内容。请先保存，或明确放弃草稿后再预览。';draw();return;}busy=true;draw();const g=generation;try{
    const targets=[];for(const p of targetRows()){const d=await sdk.call('detail',{name:p.name,scope:p.scope});if(!d.governance?.lifecycle?.supported)throw Error('所选项目需要先迁移到新治理格式，或更新配套Core。');targets.push({id:d.governance.project.metadata.id,path:d.path});}
    const data={targets,reason,actor};const value=await sdk.call('lifecycle.'+operation(),{...selected,data,dryRun:true});if(alive&&g===generation)preview={...value,data};
  }catch(e){if(alive&&g===generation)error=e.message;}finally{if(alive&&g===generation){busy=false;draw();}}}
  async function commit(){if(busy||!pending&&!preview?.allowed)return;if(drafts()){error='窗口出现新草稿，请先处理后重新预览。';preview=null;draw();return;}pending??={...preview.data,operationId:'project_'+randomId().replace(/[^A-Za-z0-9]/g,''),ifMatch:preview.ifMatch};busy=true;error='';persist();draw();const g=generation;try{
    const result=await sdk.call('lifecycle.'+operation(),{...selected,data:pending});if(!alive||g!==generation)return;pending=null;persist();node.hidden=true;await onChanged(result,selected.name);
  }catch(e){if(alive&&g===generation){error=e.message+(e.recoveryId?'；存在待恢复操作，请交给Agent核对恢复。':'');if(e.code?.includes('CONFLICT')||['PROJECT_ARCHIVE_BLOCKED','PROJECT_TRANSITION_PREVIEW_REQUIRED','PROJECT_TRANSITION_OPERATION'].includes(e.code)){pending=null;preview=null;}persist();}}finally{if(alive&&g===generation){busy=false;draw();}}}
  function draw(){if(!alive||!selected)return;node.replaceChildren();const archiving=operation()==='archive';node.classList.toggle('is-danger',archiving);const heading=el('h2','',title());heading.tabIndex=-1;node.append(heading,el('p','kp-muted',archiving?'归档后，所选项目移入档案并转为只读，保留业务状态。请先预览影响，再确认归档。':'恢复到当前目录，保留业务状态和验收记录；继续推进前重新核对事实。'));
    node.append(field('原因',reason,v=>reason=v),field('操作者',actor,v=>actor=v));
    const pick=el('fieldset','pg-lifecycle-targets');pick.append(el('legend','','本次项目范围'));
    for(const p of projects.filter(p=>p.scope===selected.scope)){const l=el('label'),c=el('input');c.type='checkbox';c.checked=chosen.has(p.name);c.disabled=busy||!!pending||p.name===selected.name;c.addEventListener('change',()=>{c.checked?chosen.add(p.name):chosen.delete(p.name);preview=null;draw();});l.append(c,document.createTextNode(p.title||p.name));pick.append(l);}node.append(pick);
    if(error){const n=el('p','pm-error',error);n.setAttribute('role','alert');node.append(n);}
    if(drafts())node.append(button('放弃本窗口草稿',()=>{try{discardDrafts(targetRows());error='';preview=null;draw();}catch(e){error=e.message;draw();}}));
    if(preview){node.append(el('h3','',preview.allowed?'检查通过，请核对范围':'需要先处理这些事项'));for(const x of [...preview.blockers??[],...preview.warnings??[]])node.append(el('p','pm-reason',x.message));for(const t of preview.targets??[])node.append(el('p','pg-lifecycle-location',t.name+' → '+t.to));if(!preview.allowed)node.append(button('准备收口或暂停对话',()=>onPrepare?.('请核对项目「'+selected.name+'」的归档意图、当前结果和遗留安排，按实际情况引导完成、取消或暂停，再预览归档。')));}
    const actions=el('div','pm-actions');const check=button(busy?'正在核对…':'预览影响',inspect);check.disabled=busy||!!pending;actions.append(check);if(preview?.allowed||pending){const b=button(busy?'正在办理…':pending?'核对此次操作':archiving?'确认归档':title(),commit,archiving?'pm-primary is-danger':'pm-primary');b.dataset.transitionCommit='';b.disabled=busy;actions.append(b);}const close=button('返回项目',()=>{generation++;node.hidden=true;returnFocus?.focus({preventScroll:true});});close.disabled=busy||!!pending;actions.append(close);node.append(actions);
  }
  try{const saved=JSON.parse(sessionStorage.getItem(storage)??'null');if(saved?.pending){({selected,projects,reason,actor,preview,pending}=saved);chosen=new Set(saved.chosen);node.hidden=false;draw();}}catch{error='归档回执缓存无法读取，请按操作ID核对，原存储已保留。';}
  return {node,open(p,list,trigger){if(!p||busy)return;if(!pending){selected=p;projects=list;chosen=new Set([p.name]);reason='';preview=null;error='';generation++;}returnFocus=trigger;node.hidden=false;draw();node.scrollIntoView({block:'start'});node.querySelector('h2')?.focus({preventScroll:true});},dismiss(){if(node.hidden)return true;if(busy||pending)return false;generation++;node.hidden=true;return true;},dispose(){persist();alive=false;generation++;node.remove();}};
}
