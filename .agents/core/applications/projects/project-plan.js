import {PROJECT_PLAN_TABS,projectStatusNeedsReason,projectPlanView,projectReferenceKey} from './project-plan-model.js';
import {milestoneCode} from './hierarchy-model.js';

const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const button=(text,fn,cls='pg-plan-text-button')=>{const node=el('button',cls,text);node.type='button';node.addEventListener('click',fn);return node;};
const referenceKey=ref=>ref.path??ref.url;

export function createProjectPlanEditor({draft,record,getRecord,state,labels,field,writable,busy,modified,id,renderMarkdown,docLink,
  onObject,onProject,onFile,getFiles,getProjects,resolveParent,track,isCurrent}){
  const root=el('div','pg-project-plan'),m=draft.value.metadata;
  state.editing??=new Set();state.scroll??={};state.details??={};
  if(!PROJECT_PLAN_TABS.some(([key])=>key===state.tab))state.tab='plan';
  const identity=id('project_plan'),tabs=el('div','pg-plan-tabs'),panel=el('section','pg-plan-panel');
  tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','项目方案分区');
  panel.setAttribute('role','tabpanel');panel.tabIndex=-1;panel.id=identity+'-panel';
  const controls=new Map();
  function activate(key,focus=false){
    const reader=root.closest('.pg-project-context-reader');
    if(reader)state.scroll[state.tab]=reader.scrollTop;
    state.tab=key;if(key==='materials')state.filesLoaded=false;render();
    if(reader)reader.scrollTop=state.scroll[key]??0;
    if(focus)controls.get(key).focus();
  }
  for(const [key,label]of PROJECT_PLAN_TABS){
    const control=button(label,()=>activate(key),'pg-plan-tab');
    control.id=identity+'-'+key;control.setAttribute('role','tab');control.setAttribute('aria-controls',panel.id);
    control.addEventListener('keydown',event=>{
      const index=PROJECT_PLAN_TABS.findIndex(([item])=>item===key);
      const next=event.key==='Home'?0:event.key==='End'?2:event.key==='ArrowLeft'?(index+2)%3:event.key==='ArrowRight'?(index+1)%3:null;
      if(next===null)return;event.preventDefault();activate(PROJECT_PLAN_TABS[next][0],true);
    });
    controls.set(key,control);tabs.append(control);
  }
  root.append(tabs,panel);
  let composing=false,refreshPending=false;
  root.addEventListener('compositionstart',()=>{composing=true;});
  root.addEventListener('compositionend',()=>{composing=false;if(refreshPending)queueMicrotask(()=>state.refresh());});
  root.addEventListener('focusout',event=>{if(refreshPending&&!root.contains(event.relatedTarget))queueMicrotask(()=>state.refresh());});
  state.refresh=({force=false}={})=>{
    if(!root.isConnected)return;
    const inputs=[...root.querySelectorAll('input,textarea,select')],focused=document.activeElement,index=inputs.indexOf(focused);
    const textEditing=index>=0&&(focused.tagName==='TEXTAREA'||focused.tagName==='INPUT'&&!['checkbox','radio'].includes(focused.type));
    if(composing||(textEditing||index>=0||root.contains(focused)&&focused.closest('button,a'))&&!force){refreshPending=true;return;}
    refreshPending=false;
    const selection=index>=0&&typeof focused.selectionStart==='number'?[focused.selectionStart,focused.selectionEnd]:null;
    render();
    const replacement=index>=0?root.querySelectorAll('input,textarea,select')[index]:null;
    if(replacement){replacement.focus({preventScroll:true});if(selection)replacement.setSelectionRange(...selection);}
  };
  const text=value=>value===null||value===undefined||value===''?'未填写':String(value);
  function values(target,rows){
    const list=el('dl','pg-plan-values');
    for(const [label,value,wide]of rows){
      const row=el('div',wide?'is-wide':'');row.append(el('dt','',label));
      const body=el('dd');body.append(value instanceof Node?value:document.createTextNode(text(value)));row.append(body);list.append(row);
    }
    target.append(list);
  }
  function empty(target,message){target.append(el('p','pg-plan-empty',message));}
  function disclosure(key,title,content,cls='pg-plan-disclosure'){
    const details=el('details',cls);details.open=!!state.details[key];details.append(el('summary','',title));
    const body=el('div','pg-plan-disclosure-body');content(body);details.append(body);
    details.addEventListener('toggle',()=>{state.details[key]=details.open;});return details;
  }
  function origin(target,copy,paths=[draft.path]){
    target.append(disclosure('origin:'+state.tab,'来源与口径',body=>{
      body.append(el('p','',copy));
      for(const path of [...new Set(paths.filter(Boolean))])body.append(el('p','pg-plan-source-path',path));
    },'pg-plan-origin'));
  }
  function change(fn){fn();modified();}
  function section(key,title,description,read,edit){
    const group=el('section','pg-plan-section');group.dataset.planSection=key;
    const heading=el('header','pg-plan-section-heading'),label=el('div');label.append(el('h3','',title));
    if(description)label.append(el('p','',description));heading.append(label);
    const body=el('div','pg-plan-section-body');
    function draw(){
      body.replaceChildren();const editing=state.editing.has(key)&&writable;
      group.toggleAttribute('data-editing',editing);(editing?edit:read)(body);
      if(toggle){toggle.textContent=editing?'收起编辑':'编辑';toggle.setAttribute('aria-label',(editing?'收起编辑':'编辑')+title);}
    }
    const toggle=writable&&edit?button('',()=>{
      state.editing.has(key)?state.editing.delete(key):state.editing.add(key);draw();
      if(state.editing.has(key))body.querySelector('input,textarea,select')?.focus();
    }):null;
    if(toggle){toggle.disabled=busy;heading.append(toggle);}
    group.append(heading,body);draw();panel.append(group);return {group,body,draw};
  }
  function projectLink(ref){
    if(!ref)return el('span','pg-plan-empty','无上级项目');
    const doc=record.documents.find(item=>item.path===ref.path&&item.metadata.id===ref.id);
    return button(doc?.metadata.name??ref.path.split('/').at(-2),()=>onProject(ref),'pg-plan-inline-link');
  }
  function children(target){
    if(!m.child_projects?.length){empty(target,'暂无子项目');return;}
    const list=el('div','pg-plan-link-list');for(const ref of m.child_projects)list.append(projectLink(ref));target.append(list);
  }
  function parentField(target){
    const wrap=el('label','pm-field'),select=el('select');wrap.append(el('span','','上级项目'),select);
    const error=el('p','pm-error');
    state.updateParentControl=()=>{
      if(!select.isConnected&&select.options.length)return;
      const options=[{path:'',title:'无上级项目'},...(state.projects??[])],current=m.parent_project;
      if(current&&!options.some(item=>item.path===current.path))options.push({path:current.path,title:record.documents.find(doc=>doc.path===current.path)?.metadata.name??current.path.split('/').at(-2)});
      select.replaceChildren();for(const item of options){const option=el('option','',item.title);option.value=item.path;select.append(option);}
      select.value=current?.path??'';select.disabled=busy||state.parentLoading;
      error.textContent=state.parentError??'';error.hidden=!state.parentError;
    };
    state.updateParentControl();
    select.addEventListener('change',()=>{
      const path=select.value;
      if(!path){change(()=>m.parent_project=null);return;}
      const choice=state.projects?.find(item=>item.path===path);if(!choice)return;
      state.parentLoading=true;select.disabled=true;state.parentError='';
      const operation=(async()=>{
        try{
          const doc=await resolveParent(choice);
          if(isCurrent())change(()=>m.parent_project={id:doc.metadata.id,path:doc.path});
        }catch(error){state.parentError=error.message;throw error;}
        finally{state.parentLoading=false;state.updateParentControl?.();state.refresh?.();}
      })();track(operation);void operation.catch(()=>{});
    });
    target.append(wrap,error);
    if(!state.projects&&!state.projectsLoading&&!state.projectsError){
      state.projectsLoading=true;
      void getProjects().then(projects=>{
        const descendants=new Set();
        function visit(ref){if(descendants.has(ref.path))return;descendants.add(ref.path);const doc=record.documents.find(item=>item.path===ref.path);for(const child of doc?.metadata.child_projects??[])visit(child);}
        visit({path:draft.path});
        state.projects=projects.filter(p=>p.scope==='current'&&!descendants.has(p.path)).map(p=>({...p,title:p.title??p.name}));state.projectsError='';
      }).catch(error=>{state.projectsError=error.message;}).finally(()=>{state.projectsLoading=false;state.updateParentControl?.();state.refresh?.();});
    }
    if(state.projectsError){const line=el('p','pm-error',state.projectsError);line.append(' ',button('重试',()=>{state.projectsError='';render();}));target.append(line);}
  }
  function plan(){
    const basic=section('basic','基本信息','',body=>{
      values(body,[['项目名称',m.name],['项目状态',labels[m.status]],['当前管理阶段',labels[m.phase]],['负责人',m.owner],['项目规模',labels[m.level]],['推进类型',labels[m.mode]],['同时推进上限',m.wip_limit+' 项任务'],['上级项目',projectLink(m.parent_project)]]);
      const stateRows=[];
      if(m.status_reason)stateRows.push(['状态原因',m.status_reason,true]);if(m.blocker)stateRows.push(['阻塞原因',m.blocker,true]);
      if(m.resume_condition)stateRows.push(['恢复条件',m.resume_condition,true]);if(m.status==='paused')stateRows.push(['恢复后回到',labels[m.resume_status]]);
      if(stateRows.length)values(body,stateRows);
      const related=el('div','pg-plan-related');related.append(el('span','pg-plan-caption','子项目'));children(related);body.append(related);
    },body=>{
      const grid=el('div','pg-plan-field-grid');field(grid,'项目名称',m.name,v=>m.name=v);field(grid,'负责人',m.owner,v=>m.owner=v||null);
      statusFields(grid);
      field(grid,'项目规模',m.level,v=>m.level=v,{options:['A','B','C','D']});field(grid,'推进类型',m.mode,v=>m.mode=v,{options:['finite','ongoing']});
      const capacity=field(grid,'同时推进上限',m.wip_limit,v=>m.wip_limit=Number(v));capacity.type='number';capacity.min='1';capacity.max='50';parentField(grid);body.append(grid);
      statusDetails(body,{includeNextAction:true});
      const related=el('div','pg-plan-related');related.append(el('span','pg-plan-caption','子项目'));children(related);body.append(related);
    });
    basic.group.classList.add('pg-plan-basic');
    listSection('goals','项目目标','','goals','目标',
      [['目标','title',false],['预期结果','successCriteria',true]],'暂无项目目标');
    section('approach','背景、范围与推进方式','',body=>{
      if(draft.value.body.trim()){const prose=el('div','pg-plan-prose');prose.append(renderMarkdown(draft.value.body));body.append(prose);}else empty(body,'尚未填写项目方案正文');
    },body=>{const input=field(body,'方案正文',draft.value.body,v=>draft.value.body=v,{textarea:true});input.rows=14;input.classList.add('pg-plan-body-input');});
    listSection('criteria','整体完成条件','','criteria','条件',
      [['完成条件','text',true]],'尚未填写整体完成条件');
    origin(panel,'目标、完成条件和方案正文直接读取当前项目原件。基本信息只用于项目归属与管理安排；这里不会从正文自动生成或替换目标。');
  }
  function statusFields(target){
    const base=draft.base?.metadata??m;
    let statuses=record.stateModel.states.project;
    if(base.status==='paused')statuses=statuses.filter(status=>['paused','cancelled',base.resume_status].includes(status));
    const status=field(target,'项目状态',m.status,value=>{m.status=value;if(value==='paused'&&base.status!=='paused')m.resume_status=base.status;},{options:statuses});
    status.addEventListener('change',()=>render());
    field(target,'当前管理阶段',m.phase,value=>m.phase=value,{options:['definition','planning','execution','review']});
  }
  function statusDetails(target,{includeNextAction=false}={}){
    const base=draft.base?.metadata??m;
    if(projectStatusNeedsReason(m,base))field(target,'状态原因',m.status_reason,value=>m.status_reason=value||null,{textarea:true});
    const blocker=el('label','pg-checkbox'),check=el('input');check.type='checkbox';check.checked=!!m.blocker||!!state.blockerEditing;check.disabled=busy;
    check.addEventListener('change',()=>{state.blockerEditing=check.checked;if(!check.checked)change(()=>m.blocker=null);render();});blocker.append(check,el('span','','当前遇到阻塞'));target.append(blocker);
    if(check.checked)field(target,'阻塞原因',m.blocker,value=>m.blocker=value.trim()?value:null,{textarea:true});
    if(includeNextAction&&(check.checked||m.status==='paused'))field(target,'下一步',m.next_action,value=>m.next_action=value.trim()?value:null,{textarea:true});
    if(check.checked||m.status==='paused'||m.resume_condition)field(target,'恢复条件',m.resume_condition,value=>m.resume_condition=value.trim()?value:null,{textarea:true});
    if(m.status==='paused')values(target,[['恢复后回到',labels[m.resume_status]]]);
  }
  function listSection(key,title,description,property,itemLabel,fields,emptyText){
    const result=section(key,title,description,body=>{
      if(!m[property]?.length){empty(body,emptyText);return;}
      const list=el('ol','pg-plan-items');
      for(const item of m[property]){
        const row=el('li');row.append(el('strong','',text(item.title??item.text)));
        for(const [label,fieldName]of fields.slice(1))if(item[fieldName]){const value=el('p','',item[fieldName]);value.title=label;row.append(value);}
        if(item.state)row.append(el('span','pg-plan-item-state',({adopted:'已采用',proposed:'待决定',superseded:'已替代',mitigating:'应对中',open:'待处理',closed:'已处理'})[item.state]??item.state));
        list.append(row);
      }body.append(list);
    },body=>{
      for(const item of m[property]??[]){
        const row=el('div','pg-plan-item-editor');
        for(const [label,name,textarea]of fields)field(row,label,item[name],v=>item[name]=v,{textarea});
        const remove=button('移除'+itemLabel,()=>{change(()=>m[property]=m[property].filter(value=>value!==item));result.draw();});remove.disabled=busy;row.append(remove);body.append(row);
      }
      const add=button('增加'+itemLabel,()=>{change(()=>{m[property]??=[];m[property].push({id:id(key),[fields[0][1]]:''});});result.draw();body.querySelector('.pg-plan-item-editor:last-of-type input,.pg-plan-item-editor:last-of-type textarea')?.focus();});
      add.disabled=busy;body.append(add);
    });
  }
  function progress(){
    const view=projectPlanView(record,{...record.project,metadata:m});
    section('current','当前安排','',body=>{
      values(body,[['项目状态',labels[m.status]],['当前管理阶段',labels[m.phase]]]);
      body.append(el('p','pg-plan-next-action',m.next_action||'尚未记录项目下一步'));
      const attention=el('div','pg-plan-attention');attention.append(el('span','pg-plan-caption','人工关注'));
      if(view.attention.length)workList(attention,view.attention,'');else empty(attention,'尚未选择关注的里程碑或任务');
      body.append(attention);
      if(m.blocker||m.status==='paused'){
        const blocked=el('div','pg-plan-blocked');blocked.append(el('strong','',m.status==='paused'?'项目已暂停':'当前阻塞'));
        const rows=[];if(m.blocker)rows.push(['阻塞原因',m.blocker,true]);if(m.status_reason)rows.push(['状态原因',m.status_reason,true]);
        if(m.owner)rows.push(['解阻负责人',m.owner]);if(m.resume_condition)rows.push(['恢复条件',m.resume_condition,true]);
        if(m.status==='paused')rows.push(['恢复后回到',labels[m.resume_status]]);values(blocked,rows);body.append(blocked);
      }else if(m.status_reason)body.append(el('p','pg-plan-note',m.status_reason));
    },body=>{
      const grid=el('div','pg-plan-field-grid');statusFields(grid);body.append(grid);
      field(body,'下一步',m.next_action,v=>m.next_action=v.trim()?v:null,{textarea:true});
      statusDetails(body);
    });
    section('work','实际在制与下一批','按任务状态与承诺记录汇总',body=>{
      const inFlight=el('div','pg-plan-work-group');inFlight.append(el('h4','','实际在制'));workList(inFlight,view.inFlight,'当前没有进行中或待验收的任务');body.append(inFlight);
      const next=el('div','pg-plan-work-group');next.append(el('h4','','下一批'));workList(next,view.next,'尚未安排下一批任务',true);body.append(next);
    });
    section('milestones','里程碑进展','任务完成与阶段验收分别核对',body=>milestones(body,false),body=>milestones(body,true));
    function milestones(body,editing){
      if(!view.milestones.length){empty(body,'尚未建立里程碑，可按项目需要逐步细化');return;}
      const counts=el('p','pg-plan-counts');counts.append(el('span','','阶段验收通过 '+view.stats.milestonesAccepted+' / '+view.stats.milestonesTotal),el('span','','任务有效完成 '+view.stats.tasksCompleted+' / '+view.stats.tasksTotal));body.append(counts);
      const list=el('div','pg-plan-milestones');
      for(const item of view.milestones){
        const {document:milestone,tasks}=item;
        const row=el('div','pg-plan-milestone');
        if(editing){
          const label=el('label','pg-checkbox'),check=el('input');check.type='checkbox';check.setAttribute('aria-label','关注里程碑：'+milestone.metadata.name);
          check.checked=m.focus_milestones?.some(ref=>ref.id===milestone.metadata.id&&ref.path===milestone.path);check.disabled=busy;
          check.addEventListener('change',()=>change(()=>{m.focus_milestones=(m.focus_milestones??[]).filter(ref=>ref.id!==milestone.metadata.id);if(check.checked)m.focus_milestones.push({id:milestone.metadata.id,path:milestone.path});}));
          label.append(check,el('span','','关注'));row.append(label);
        }
        const info=el('div');
        info.append(button([milestoneCode(milestone),milestone.metadata.name].filter(Boolean).join(' · '),()=>onObject(milestone.path),'pg-plan-inline-link'));
        const taskCopy=item.total?'任务有效完成 '+item.completed+' / '+item.total:tasks.length?'当前无有效任务':'计划尚未细化';
        info.append(el('p','',taskCopy+' · '+(item.stale?'阶段结论待复核':item.accepted?'阶段验收已通过':'阶段尚待验收')));
        const tag=el('span','pm-chip state-'+milestone.metadata.status,labels[milestone.metadata.status]);row.append(info,tag);
        if(!editing&&item.focus)row.append(el('span','pg-plan-focus','人工关注'));
        list.append(row);
      }body.append(list);
    }
    listSection('risks','风险','仅表示已记录的风险，不代表风险已穷尽','risks','风险',
      [['风险','title',false],['影响','impact',true],['应对措施','response',true]],'暂无已记录风险');
    listSection('decisions','重要决定','','decisions','决定',
      [['决定','title',false],['依据','rationale',true]],'暂无已记录决定');
    origin(panel,'管理活动、下一步及人工关注来自项目和里程碑原件；关注不等于启动。实际在制按任务的进行中、待验收状态统计。下一批读取承诺记录，可开始条件由 Core 核对负责人、依赖、条件、父级状态及容量。任务完成数不是目标达成率；阶段验收以正式复盘和有效证据为准。');
  }
  function workList(target,items,emptyText,readiness=false){
    if(!items.length){if(emptyText)empty(target,emptyText);return;}
    const list=el('ul','pg-plan-work-list');
    for(const item of items){
      const doc=item.document,m=doc.metadata,row=el('li'),heading=el('div','pg-plan-work-heading');
      const code=m.kind==='milestone'?milestoneCode(doc):m.task_code;
      heading.append(button([code,m.name].filter(Boolean).join(' · '),()=>onObject(doc.path),'pg-plan-inline-link'),el('span','pg-plan-work-status',labels[m.status]??m.status));
      if(item.stale)heading.append(el('span','pg-plan-warning','待复核'));row.append(heading);
      if(m.owner)row.append(el('span','pg-plan-caption',m.owner+' 负责'));
      if(m.kind==='task'&&m.next_action)row.append(el('p','pg-plan-work-action',m.next_action));
      if(readiness){
        if(item.ready===null)row.append(el('span','pg-plan-caption','当前 Core 未提供可开始判断'));
        else if(item.ready===true)row.append(el('span','pg-plan-ready','当前可开始'));
        else if(item.reasons?.length)row.append(disclosure('readiness:'+doc.path,'查看尚不能开始的原因',body=>{const reasons=el('ul');for(const reason of item.reasons)reasons.append(el('li','',reason));body.append(reasons);},'pg-plan-origin'));
        else row.append(el('span','pg-plan-caption',item.ready===null?'当前 Core 未提供可开始判断':'尚未满足开始条件'));
      }
      list.append(row);
    }target.append(list);
  }
  function openReference(ref){
    if(ref.path){const kind=ref.kind==='directory'?'directory':'file';return button(ref.name??ref.path.split('/').at(-1),()=>onFile({...ref,kind,name:ref.name??ref.path.split('/').at(-1)}),'pg-plan-inline-link');}
    const link=el('a','pg-plan-inline-link',ref.role??ref.url);link.href=ref.url;link.target='_blank';link.rel='noopener noreferrer';return link;
  }
  function referenceList(body,refs,emptyText){
    if(!refs.length){empty(body,emptyText);return;}
    const list=el('ul','pg-plan-reference-list');
    for(const ref of refs){const row=el('li');row.append(openReference(ref));if(ref.source)row.append(el('span','',typeof ref.source==='string'?ref.source:ref.source.name));if(ref.digest||ref.version)row.append(el('span','',ref.digest?'固定版本 · '+ref.digest.slice(0,8):ref.version));
      row.append(disclosure('reference:'+projectReferenceKey(ref),'查看来源',details=>details.append(el('p','pg-plan-source-path',referenceKey(ref))),'pg-plan-origin'));list.append(row);
    }body.append(list);
  }
  function materials(){
    const view=projectPlanView(record,{...record.project,metadata:m});
    let query=(state.materialQuery??'').trim().toLocaleLowerCase();
    const matches=ref=>!query||[ref.name,ref.role,ref.path,ref.url,ref.source].filter(Boolean).join(' ').toLocaleLowerCase().includes(query);
    const search=el('input','pg-plan-search');search.type='search';search.value=state.materialQuery??'';search.placeholder='查找成果、完成条件或来源';search.setAttribute('aria-label','查找资料与成果');
    const searchChanged=event=>{state.materialQuery=search.value;query=search.value.trim().toLocaleLowerCase();if(!event.isComposing){results.draw();reviews.draw();references.draw();}};search.addEventListener('input',searchChanged);search.addEventListener('compositionend',searchChanged);panel.append(search);
    const results=section('results','成果与证据','引用不等于验收通过，结论按对应条件核对',body=>{
      const items=view.results.filter(item=>!query||[item.name,item.key,...item.sources.map(source=>source.name),...item.goals.map(goal=>goal.title),...item.criteria.map(criterion=>criterion.text)].join(' ').toLocaleLowerCase().includes(query));
      if(!items.length){empty(body,query?'没有匹配的成果或证据':'尚未记录成果引用或验收证据');return;}
      const list=el('ul','pg-plan-results');
      for(const item of items){
        const row=el('li','pg-plan-result'),heading=el('div','pg-plan-result-heading');
        const current=item.versions.find(ref=>!ref.digest&&!ref.version),primary=current??item.reference;
        heading.append(openReference({...primary,name:item.name}));
        if(item.stale)heading.append(el('span','pg-plan-warning','待复核'));row.append(heading);
        const sources=el('div','pg-plan-result-sources');sources.append(el('span','pg-plan-caption','来源'));
        for(const source of item.sources)sources.append(sourceLink(source));row.append(sources);
        if(item.goals.length)row.append(el('p','pg-plan-result-goals','关联目标：'+item.goals.map(goal=>goal.title).join('、')));
        if(!item.criteria.length)row.append(el('p','pg-plan-note','成果引用 · 尚无对应完成条件的评审记录'));
        else{
          const passed=item.criteria.filter(criterion=>criterion.effective).length;
          row.append(el('p','pg-plan-note',passed?'包含 '+passed+' 项有效通过的条件记录':'已有条件评审记录，尚无可确认为有效通过的结论'));
        }
        const versions=el('div','pg-plan-versions');
        for(const ref of item.versions){
          const label=ref.digest?'固定版本 · '+ref.digest.slice(0,8):ref.version?'记录版本 · '+ref.version:'当前原件';
          versions.append(openReference({...ref,name:label}));
        }row.append(versions);
        row.append(disclosure('result:'+item.key,'条件、评审与来源详情'+(item.criteria.length?'（'+item.criteria.length+'）':''),details=>{
          if(item.criteria.length){
            const conditions=el('ul','pg-plan-assessments');
            for(const criterion of item.criteria){
              const condition=el('li'),title=el('div','pg-plan-assessment-heading');
              title.append(el('strong','',criterion.text),el('span',criterion.stale?'pg-plan-warning':'pg-plan-assessment-state',assessmentLabel(criterion)));condition.append(title);
              const metadata=[criterion.reviewer?'复核：'+criterion.reviewer:'未记录复核者',criterion.reviewedAt?formatTime(criterion.reviewedAt):null,criterion.reference.digest?'固定版本 '+criterion.reference.digest.slice(0,8):criterion.reference.version].filter(Boolean);
              condition.append(el('p','pg-plan-caption',metadata.join(' · ')),sourceLink(criterion.source));conditions.append(condition);
            }details.append(conditions);
          }
          const paths=new Set([...item.sources.map(source=>source.path),...item.versions.map(referenceKey)]);for(const path of paths)details.append(el('p','pg-plan-source-path',path));
        },'pg-plan-origin'));
        list.append(row);
      }body.append(list);
    });
    const reviews=section('reviews','验收与复盘','',body=>{
      const items=view.reviews.filter(item=>!query||[item.document.metadata.name,item.document.path,item.subject.metadata.name,labels[item.outcome],labels[item.status]].join(' ').toLocaleLowerCase().includes(query));
      if(!items.length){empty(body,query?'没有匹配的验收或复盘记录':'尚未记录正式复盘，不从任务数或文件数量推断验收结论');return;}
      const list=el('ul','pg-plan-review-list');for(const item of items){
        const row=el('li');row.append(openReference({path:item.document.path,name:item.document.metadata.name}),el('span','pg-plan-caption','对象：'+item.subject.metadata.name));
        row.append(el('span',item.stale?'pg-plan-warning':'pg-plan-review-state',item.stale?'结论待复核':item.status==='draft'?'复盘草稿 · 尚未形成正式结论':(labels[item.status]??item.status)+' · '+(labels[item.outcome]??item.outcome)));
        list.append(row);
      }body.append(list);
    });
    const references=section('references','参考资料','当前项目明确引用的材料',body=>{
      const excluded=new Set(view.results.map(item=>item.key)),items=new Map();
      for(const ref of view.materials)if(ref.path!==draft.path&&!excluded.has(referenceKey(ref))&&!['灵感闪现.md','项目管理.json'].includes(ref.name)&&ref.path!==m.review_ref?.path)items.set(projectReferenceKey(ref),ref);
      referenceList(body,[...items.values()].filter(matches),query?'没有匹配的参考资料':'尚未明确引用参考资料');
      const known=new Set([...excluded,...[...items.values()].map(referenceKey)]),other=(state.files??[]).filter(ref=>ref.path!==draft.path&&!known.has(referenceKey(ref))&&!['灵感闪现.md','项目管理.json'].includes(ref.name)&&ref.path!==m.review_ref?.path).filter(matches);
      const files=disclosure('other-files','其他项目文件'+(other.length?'（'+other.length+'）':''),details=>{
        referenceList(details,other,query?'没有匹配的其他文件':'暂无其他项目文件');
        if(state.filesLoading)details.append(el('p','pg-plan-empty','正在读取项目文件…'));
        if(state.filesError){const line=el('p','pm-error',state.filesError);line.append(' ',button('重试',()=>{state.filesError='';state.filesLoaded=false;render();}));details.append(line);}
      });if(query&&other.length)files.open=true;body.append(files);
    });
    state.updateMaterialsControl=()=>{if(references.group.isConnected&&results.group.isConnected){references.draw();results.draw();reviews.draw();}};
    origin(panel,'成果与证据来自项目及所属任务、里程碑的明确引用。对应条件、复核者与结论取自验收或复盘原件；同一文件的当前内容与固定版本分别保留。程序不会从文件名判断成果，也不把生成或引用文件当作验收通过。');
    const system=el('details','pg-plan-system');system.append(el('summary','','系统信息'));
    values(system,[['项目 ID',m.id],['更新时间',m.updated],['原件路径',draft.path,true]]);panel.append(system);
    if(!state.filesLoaded&&!state.filesLoading&&!state.filesError){
      state.filesLoading=true;
      void getFiles().then(files=>{state.files=files;state.filesLoaded=true;state.filesError='';})
        .catch(error=>{state.filesError=error.message;}).finally(()=>{state.filesLoading=false;if(state.tab==='materials')state.updateMaterialsControl?.();});
    }
  }
  function sourceLink(source){
    return button(source.name,()=>source.kind==='review'?onFile({path:source.path,name:source.name,kind:'file'}):onObject(source.path),'pg-plan-inline-link');
  }
  function assessmentLabel(criterion){
    if(criterion.result==='passed')return criterion.effective?'通过':criterion.stale?'原记录通过 · 待复核':criterion.reviewStatus==='draft'?'草稿中记录通过':'记录通过 · 有效性待核对';
    return (criterion.stale?'原记录':'')+(labels[criterion.result]??criterion.result)+(criterion.stale?' · 待复核':'');
  }
  function formatTime(value){const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleString(undefined,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}
  function render(){
    record=getRecord?.()??record;
    for(const [key,control]of controls){const selected=key===state.tab;control.setAttribute('aria-selected',String(selected));control.tabIndex=selected?0:-1;}
    panel.setAttribute('aria-labelledby',controls.get(state.tab).id);panel.replaceChildren();
    panel.dataset.planTab=state.tab;
    (state.tab==='plan'?plan:state.tab==='progress'?progress:materials)();
  }
  render();return root;
}
