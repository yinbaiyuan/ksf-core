import { readFile, readdir, lstat, realpath, open, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, relative, join, dirname, sep, extname, isAbsolute } from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import YAML from 'yaml';
import { createCodexConversationsClient } from '@ksf/sdk/codex-conversations';
import { filePolicy } from '../sdk/server/workspace.js';
import {evidenceReferences,criteriaContent} from './governance-model.js';
import {projectPlanReferences} from './project-plan-model.js';
import {createProjectBrief} from './project-brief.mjs';

const MAX_TEXT = 2 * 1024 * 1024;
const states = new Set(['in_progress','paused','blocked','completed','cancelled']);
const assert = (test, text) => { if (!test) throw new Error(text); };
const slash = path => path.split(sep).join('/');
const inside = (base, path) => path === base || path.startsWith(base + sep);
const string = value => typeof value === 'string' ? value : '';

export function parseDocument(text) {
  text = text.replace(/^\uFEFF/, '');
  if (!/^---\r?\n/.test(text)) return {metadata:{}, body:text};
  const end = /^---\s*\r?$/gm; end.lastIndex = text.indexOf('\n') + 1;
  const close = end.exec(text); assert(close, '文档的元数据没有结束标记。');
  const doc = YAML.parseDocument(text.slice(text.indexOf('\n') + 1, close.index), {uniqueKeys:true, schema:'core'});
  assert(!doc.errors.length && !doc.warnings.length, '文档的 YAML 元数据无法读取。');
  YAML.visit(doc, (_key, node) => { assert(!YAML.isAlias(node) && !node?.anchor, '不支持带锚点或别名的元数据。'); });
  const metadata = doc.toJS({maxAliasCount:0});
  assert(metadata && typeof metadata === 'object' && !Array.isArray(metadata), '文档元数据应为字段集合。');
  return {metadata, body:text.slice(close.index + close[0].length).replace(/^\r?\n/,'')};
}

export function sections(body) {
  const result = []; let fence = null, current;
  for (const line of body.split(/\r?\n/)) {
    const mark = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (mark) { if (!fence) fence = mark; else if (mark[0] === fence[0] && mark.length >= fence.length) fence = null; }
    const heading = !fence && /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
    if (heading) { current = {level:heading[1].length, title:heading[2], lines:[]}; result.push(current); }
    else current?.lines.push(line);
  }
  return result.map(({lines,...item})=>({...item,body:lines.join('\n').trim()}));
}

export function createBackend(context, {cli: injectedCLI, management: injectedManagement, governance: injectedGovernance,lifecycle:injectedLifecycle} = {}) {
  let disposed = false; const children = new Set(); let writes = Promise.resolve();
  const reviewSessions=new Set();
  const root = resolve(context.workspace), data = resolve(context.dataDirectory);
  const conversations = createCodexConversationsClient(context);
  const briefs=createProjectBrief(context,{readGovernance:params=>governance('read',params),readContext:path=>textFile(path)});
  const requireLive = () => assert(!disposed, '应用已关闭。');

  async function readPreferences() {
    try {
      const text = context.storage
        ? (await context.storage.read('preferences.json')).text
        : await readFile(join(data,'preferences.json'),'utf8');
      const value = JSON.parse(text ?? '{"schemaVersion":1}');
      assert(value?.schemaVersion === 1, '应用显示设置格式不受支持。');
      assert(value.pinnedProjects === undefined || (Array.isArray(value.pinnedProjects)
        && value.pinnedProjects.every(key => typeof key === 'string')), '固定项目设置格式无效。');
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return {schemaVersion:1};
      throw error;
    }
  }

  function updatePreferences(update) {
    const pending = writes.catch(() => {}).then(async () => {
      requireLive();
      const current = await readPreferences();
      const value = update(current);
      if (value === current) return value;
      const text = JSON.stringify(value) + '\n';
      if (context.storage) {
        await context.storage.write('preferences.json', text);
      } else {
        await mkdir(data, {recursive:true});
        const temp = join(data, `.preferences-${randomUUID()}.tmp`);
        try {
          await writeFile(temp, text, {mode:0o600});
          await rename(temp, join(data,'preferences.json'));
        } finally { await rm(temp, {force:true}); }
      }
      return value;
    });
    writes = pending;
    return pending;
  }

  async function lifecycle(operation,input){
    const result=injectedLifecycle?await injectedLifecycle(operation,input):await context.services.call('projects',operation,[input]);
    assert(result&&typeof result==='object'&&result.data!==undefined,'当前Core未提供归档恢复接口，请使用配套Core。');
    if(result.errors?.length){const e=new Error(result.errors.flatMap(e=>e.issues??[e]).map(e=>e.message).join('\n'));e.code=result.errors[0].code;e.recoveryId=result.data?.recoveryId;throw e;}
    return result.data;
  }
  async function relocatedLinks(refs){
    return Promise.all(refs.map(async ref=>{if(!ref.path||!ref.href)return ref;try{const found=await lifecycle('resolve',{path:decodeURIComponent(ref.href.split('#')[0]),source:ref.source});return {...ref,path:found.path};}catch(e){return {...ref,warning:e.message};}}));
  }
  async function governance(operation,params){
    const method='governance'+operation.split('-').map(part=>part[0].toUpperCase()+part.slice(1)).join('');
    const result=injectedGovernance?await injectedGovernance(operation,params):await context.services.call('projects',method,[params]);
    assert(result&&typeof result==='object','当前Core不支持项目治理服务，请更新配套Core。');
    if(result.errors?.length){const issues=result.errors.flatMap(x=>x.issues??[x]),e=new Error(issues.map(x=>(x.path?x.path+'：':'')+x.message).join('\n'));e.code=result.errors[0].code;e.issues=issues;e.recoveryId=result.data?.recoveryId;throw e;}
    return result.data;
  }
  async function cli(args) {
    requireLive(); if (injectedCLI) return injectedCLI(args);
    const operation=args[0]==='project'?args[1]:'tasks';
    const input=operation==='read'?{name:args[2],scope:args[4]}:operation==='list'?{scope:args[3]}:{target:args[3],limit:Number(args[5]),offset:Number(args[7])};
    return context.services.call('projects',operation,[input]);
  }

  async function safePath(path) {
    assert(typeof path === 'string' && path.length < 4096 && !/[\x00-\x1f\\]/.test(path), '文件路径无效。');
    const target = resolve(root,path); assert(inside(root,target) && target !== root, '文件不在当前 KSF 内。');
    const name = slash(relative(root,target));
    assert(!name.split('/').some(p=>['.git','node_modules'].includes(p)) && (!name.startsWith('.agents/') || name.startsWith('.agents/core/docs/')), '此位置不属于项目阅读范围。');
    let cursor=root; for(const part of relative(root,target).split(sep)){cursor=join(cursor,part);assert(!(await lstat(cursor)).isSymbolicLink(),'不读取符号链接，请从原文件位置打开。');}
    assert(inside(await realpath(root),await realpath(target)), '文件实际位置超出当前 KSF。'); return target;
  }
  async function textFile(path) {
    const target=await safePath(path); const file=await open(target,'r');
    try { const stat=await file.stat(); assert(stat.isFile()&&stat.size<=MAX_TEXT,'只能预览 2 MB 以内的文本文件。'); const bytes=await file.readFile(); assert(bytes.length<=MAX_TEXT,'文件过大，请在文档中打开。'); return new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
    finally {await file.close();}
  }
  function key(params) {
    assert(params && typeof params.name === 'string' && params.name.length && !/[\/\\\x00-\x1f]/.test(params.name) && !['.','..'].includes(params.name),'请选择有效项目。');
    assert(['current','archived'].includes(params.scope),'项目范围无效。'); return params;
  }
  async function project(params) {
    key(params); const result=await cli(['project','read',params.name,'--scope',params.scope]);
    assert(result.data.project,'项目记录不存在。'); return result.data.project;
  }
  async function projectContextList(params) {
    const p=await project(params);
    const base=resolve(root,p.directory), path=params.path??p.directory;
    const directory=await safePath(path);
    const allowed=target=>{
      const name=slash(relative(root,target));
      return name.length<4096&&!/[\x00-\x1f\\]/.test(name)
        &&!name.split('/').some(part=>part==='.DS_Store'||part==='node_modules')&&filePolicy(name)!=='blocked';
    };
    assert(inside(base,directory)&&allowed(directory),'请选择该项目下可阅读的目录。');
    const refs=Array.isArray(p.metadata?.milestones)?p.metadata.milestones:[];
    const indexed=new Set(refs.filter(ref=>typeof ref?.path==='string').map(ref=>dirname(resolve(root,ref.path))));
    async function isMilestoneFolder(name) {
      const target=join(base,name);
      if(name==='里程碑'||indexed.has(target))return true;
      if(!/^M\d+-[^/]+$/.test(name))return false;
      try{return (await lstat(join(target,'milestone.md'))).isFile();}
      catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')return false;throw error;}
    }
    if(directory!==base){
      const first=relative(base,directory).split(sep)[0];
      assert(!(await isMilestoneFolder(first)),'里程碑内容请从里程碑入口查看。');
    }
    const entries=[];
    for(const entry of await readdir(directory,{withFileTypes:true})){
      const target=join(directory,entry.name);
      if(!allowed(target)||!(entry.isDirectory()||entry.isFile()))continue;
      if(directory===base&&entry.isDirectory()&&await isMilestoneFolder(entry.name))continue;
      entries.push({name:entry.name,path:slash(relative(root,target)),kind:entry.isDirectory()?'directory':'file'});
    }
    entries.sort((a,b)=>a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
    return {entries};
  }
  function localLink(source, href) {
    if (!href || href.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return null;
    try {
      let path=decodeURIComponent(href.split('#')[0].split('?')[0]);
      if (!path) return null;
      if (isAbsolute(path)) { if (!inside(root,path)) return null; path=relative(root,path); }
      else path=relative(root,resolve(root,dirname(source),path));
      path=slash(path);
      if (path.startsWith('..') || /[\\\x00-\x1f]/.test(path)) return null;
      return slash(path);
    } catch {return null;}
  }
  function links(body,source) {
    const found=new Map(); let fence=null; const clean=[];
    for(const line of body.split(/\r?\n/)){const mark=/^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];if(mark){if(!fence)fence=mark;else if(mark[0]===fence[0]&&mark.length>=fence.length)fence=null;continue;}if(!fence)clean.push(line);}
    for(const match of clean.join('\n').matchAll(/(?<!!)\[([^\]\n]+)\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const href=match[2].replace(/^<|>$/g,''),path=localLink(source,href);
      if(path&&!found.has(path))found.set(path,{title:match[1],path,source,href});
      else if(/^https?:\/\//i.test(href)&&!found.has(href)) found.set(href,{title:match[1],url:href,source,href});
    }
    return [...found.values()];
  }
  async function scanTasks(p) {
    const tasks=[],warnings=[]; const directory=slash(join(p.directory,'任务'));let visited=0;
    async function walk(dir,depth=0){
      let entries;try{entries=await readdir(await safePath(dir),{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;warnings.push(`${dir}：${e.message}`);return;}
      for(const entry of entries){
        if(entry.name.startsWith('.'))continue;
        if(++visited>800){warnings.push('任务目录较大，本次只展示前 800 个条目。');return;}
        const path=slash(join(dir,entry.name));
        if(entry.isSymbolicLink()){warnings.push(`${path}：已跳过符号链接。`);continue;}
        if(entry.isDirectory()){if(depth<3)await walk(path,depth+1);continue;}
        if(!entry.isFile()||!path.endsWith('.md'))continue;
        try{
          const parsed=parseDocument(await textFile(path)),m=parsed.metadata;
          const recognized=m.checkpoint_schema===1;
          const state=recognized&&states.has(m.state)?m.state:'unknown';
          const title=string(m.name)||/^#\s+(.+)$/m.exec(parsed.body)?.[1]||entry.name.replace(/\.md$/,'');
          tasks.push({path,name:title,taskId:recognized?string(m.task_id):'',state,updated:string(m.updated),schema:recognized?'checkpoint':m.checkpoint_schema===undefined?'document':'unsupported',next:sections(parsed.body).filter(s=>/下一步|待决|未决|恢复点/.test(s.title)).map(s=>({title:s.title,body:s.body})).filter(s=>s.body).slice(-3)});
        }catch(e){warnings.push(`${path}：${e.message}`);}
      }
    }
    await walk(directory);
    const rank={in_progress:0,blocked:1,paused:2,unknown:3,completed:4,cancelled:5};
    tasks.sort((a,b)=>(rank[a.state]-rank[b.state])||b.updated.localeCompare(a.updated)||a.name.localeCompare(b.name,'zh-CN'));
    return {tasks,warnings};
  }
  async function detail(params) {
    const p=await project(params);const metadata=p.metadata??{};
    if(metadata.governance_schema!==undefined){
      const g=await governance('read',params);assert(g.format==='documents','项目治理格式不可用，保留原件并核对Core版本。');
      if(!g.valid)return {...p,title:string(metadata.name)||p.name,description:string(metadata.description),status:string(metadata.status),updated:string(metadata.updated),topics:[],sections:sections(p.body),tasks:[],warnings:[...(g.errors??[]),...(g.warnings??[])].map(x=>(x.path?x.path+'：':'')+x.message),resources:links(p.body,p.path),resourcesTruncated:false,repositories:[],governance:g};
      const own=g.documents.filter(d=>d.metadata.id===metadata.id||d.metadata.project?.id===metadata.id||d.metadata.subject?.id===metadata.id);
      const tasks=own.filter(d=>d.metadata.kind==='task').map(d=>({path:d.path,name:(d.metadata.task_code?d.metadata.task_code+' · ':'')+d.metadata.name,taskId:d.metadata.id,state:d.metadata.status,updated:d.metadata.updated,schema:'governance',next:[{title:'下一步',body:d.metadata.next_action??''}]}));
      const refs=links(p.body,p.path),seen=new Set(refs.map(x=>x.path??x.url));
      for(const d of own){for(const ref of [...links(d.body,d.path),...(d.metadata.context_refs??[]).map(r=>({...r,title:r.role??r.path??r.url,source:d.path})),...(d.metadata.result_refs??[]).map(r=>({...r,title:r.role??r.path??r.url,source:d.path})),...evidenceReferences(d.metadata).map(r=>({...r,title:r.role+' · '+(r.path?.split('/').at(-1)??r.url),source:d.path}))]){const id=ref.path??ref.url;if(!seen.has(id)){seen.add(id);refs.push(ref);}}}
      const resources=g.lifecycle?.supported&&(injectedLifecycle||context.services)?await relocatedLinks(refs.slice(0,600)):refs.slice(0,600);
      return {...p,title:string(metadata.name)||p.name,description:string(metadata.description),status:string(metadata.status),updated:string(metadata.updated),topics:metadata.topics??[],sections:sections(p.body),tasks,warnings:[...[...(g.errors??[]),...(g.warnings??[])].map(x=>(x.path?x.path+'：':'')+x.message),...resources.filter(r=>r.warning).map(r=>r.title+'：'+r.warning)],resources,resourcesTruncated:refs.length>600,repositories:(metadata.repositories??[]).map(path=>({path,title:path.split('/').at(-1)})),governance:g};
    }
    const scan=await scanTasks(p);
    const refs=links(p.body,p.path),seen=new Set(refs.map(r=>r.path??r.url));
    // Project links and explicit checkpoint links supply provenance; no semantic status guesses.
    for(const t of scan.tasks.slice(0,100)){
      try{for(const ref of links(parseDocument(await textFile(t.path)).body,t.path)){const id=ref.path??ref.url;if(!seen.has(id)){seen.add(id);refs.push(ref);}}}catch{}
    }
    return {...p,title:string(metadata.name)||p.name,description:string(metadata.description),status:string(metadata.status),updated:string(metadata.updated),topics:Array.isArray(metadata.topics)?metadata.topics.filter(x=>typeof x==='string'):[],sections:sections(p.body),...scan,resources:refs.slice(0,600),resourcesTruncated:refs.length>600,repositories:(Array.isArray(metadata.repositories)?metadata.repositories:[]).filter(x=>typeof x==='string').map(path=>({path,title:path.split('/').at(-1)}))};
  }
  async function call(method,params={},caller={}) {
    requireLive();
    if(['brief.profiles','brief.read','brief.generate'].includes(method))return briefs.call(method,params);
    if(method==='lifecycle.archive'||method==='lifecycle.restore'){
      key(params);const operation=method.slice(10);assert(params.scope===(operation==='archive'?'current':'archived'),'操作与所选范围不一致。');
      return lifecycle(operation,{name:params.name,data:params.data,dryRun:params.dryRun===true});
    }
    if(method.startsWith('governance.')){
      key(params);await project(params);const operation=method.slice('governance.'.length);
      if(operation==='criteria-digest'){
        assert(Array.isArray(params.criteria)&&params.criteria.length<=4096,'完成条件应为有效列表。');
        const content=criteriaContent(params.criteria);assert(Buffer.byteLength(content)<=MAX_TEXT,'完成条件内容过大。');
        return {digest:createHash('sha256').update(content).digest('hex')};
      }
      if(operation==='evidence'){
        const target=await safePath(params.path),bytes=await readFile(target);assert(bytes.length<=MAX_TEXT,'证据过大，请引用验证报告或清单。');const {createHash}=await import('node:crypto');return {path:params.path,digest:createHash('sha256').update(bytes).digest('hex')};
      }
      assert(['read','check','apply','migrate','renumber','context-list','recover'].includes(operation),'治理操作无效。');
      return governance(operation,{name:params.name,scope:params.scope,...(params.data!==undefined?{data:params.data}:{}),...(params.dryRun?{dryRun:true}:{})});
    }
    if(method==='inspiration.read'){
      key(params);await project(params);const g=await governance('read',{name:params.name,scope:params.scope});
      assert(g.valid&&g.format==='documents','请先修复项目原件，再打开灵感记录。');
      const owner=g.documents.find(d=>d.path===(params.ownerPath??params.milestonePath));
      const kind=owner?.metadata.kind;
      const owned=kind==='project'?owner.path===g.project.path:
        ['milestone','task'].includes(kind)&&owner.metadata.project?.path===g.project.path;
      assert(owned&&(params.ownerPath!==undefined||kind==='milestone'),'请选择这个项目的项目、里程碑或任务。');
      const path=dirname(owner.path)+'/灵感闪现.md';
      const location={path,ownerPath:owner.path,ownerKind:kind,readOnly:g.readOnly===true,...(kind==='milestone'?{milestonePath:owner.path}:{})};
      let target;try{target=await safePath(path);}catch(e){if(e.code!=='ENOENT')throw e;return {...location,text:'',etag:'missing',exists:false};}
      const file=await open(target,'r');let bytes;try{const stat=await file.stat();assert(stat.isFile()&&stat.size<=MAX_TEXT,'记录较长，请先从原文入口整理后再编辑。');bytes=await file.readFile();}finally{await file.close();}
      assert(bytes.length<=MAX_TEXT,'记录较长，请先从原文入口整理后再编辑。');
      const text=bytes.toString('utf8');assert(Buffer.from(text).equals(bytes),'记录编码不是UTF-8，请保留原件并先核对编码。');
      const {createHash}=await import('node:crypto');return {...location,text,etag:createHash('sha256').update(bytes).digest('hex'),exists:true};
    }
    if(method.startsWith('management.')) {
      key(params); await project(params);
      const operation=method.slice(11);assert(['read','check','write','import'].includes(operation),'管理操作无效。');
      if(operation==='import'){
        const p=await project(params),scan=await scanTasks(p),task=scan.tasks.find(t=>t.path===params.path);
        assert(task&&task.schema==='checkpoint','请选择本项目的有效检查点。');
        const bytes=await readFile(await safePath(task.path));
        const {createHash}=await import('node:crypto');
        return {title:task.name,source:{path:task.path,taskId:task.taskId,digest:createHash('sha256').update(bytes).digest('hex'),state:task.state},description:'从既有检查点显式接入；请复核目标、承诺和当前状态。',nextAction:task.next.map(s=>s.body).join('\n').slice(0,20000)};
      }
      const input={name:params.name,scope:params.scope,...(params.data!==undefined?{data:params.data}:{}),...(params.dryRun?{dryRun:true}:{})};
      const result=injectedManagement?await injectedManagement(operation,input):await context.services.call('projects','management'+operation[0].toUpperCase()+operation.slice(1),[input]);
      if(result.errors?.length){const e=new Error(result.errors.map(x=>(x.path?x.path+'：':'')+x.message).join('\n'));e.code=result.errors[0].code;e.issues=result.errors;throw e;}
      return result.data;
    }
    if(method.startsWith('conversation.')) {
      const action=method.slice('conversation.'.length);
      if(action==='check')return conversations.check();
      key(params); await project(params);
      const selectionPath=join(data,'conversations.json'),selectedKey=`${params.scope}:${params.name}`,surface=caller.surfaceId??'legacy';
      async function selections(){try{const value=JSON.parse(context.storage?(await context.storage.read('conversations.json')).text??'{"schemaVersion":1,"projects":{}}':await readFile(selectionPath,'utf8'));assert(value.schemaVersion===1&&value.projects,'会话选择记录格式不支持。');return value;}catch(e){if(e.code==='ENOENT')return{schemaVersion:1,projects:{}};throw e;}}
      async function remember(patch){
        const pending=writes.catch(()=>{}).then(async()=>{const value=await selections();value.surfaces??={};value.surfaces[surface]??={};value.surfaces[surface][selectedKey]={...value.surfaces[surface][selectedKey],...patch};value.projects[selectedKey]={...value.projects[selectedKey],...patch};if(context.storage){await context.storage.write('conversations.json',JSON.stringify(value)+'\n');return;}await mkdir(data,{recursive:true});const temp=join(data,`.conversations-${randomUUID()}.tmp`);try{await writeFile(temp,JSON.stringify(value)+'\n',{mode:0o600});await rename(temp,selectionPath);}finally{await rm(temp,{force:true});}});writes=pending;await pending;
      }
      if(action==='resume'){const value=await selections();return value.surfaces?.[surface]?.[selectedKey]??value.projects[selectedKey]??{};}
      if(action==='create'){
        await remember({operationId:params.operationId,threadId:null});
        const result=await conversations.create({operationId:params.operationId,project:{name:params.name,scope:params.scope},text:params.text,...(params.title?{title:params.title}:{})});
        if(result.threadId)await remember({threadId:result.threadId});return result;
      }
      if(action==='attach'){
        const result=await conversations.attach({taskId:params.taskId,project:{name:params.name,scope:params.scope}});
        if(result.attached)await remember({threadId:result.threadId,operationId:null});return result;
      }
      if(action==='operation'){
        const result=await conversations.operation(params.operationId);
        if(result.threadId)await remember({threadId:result.threadId});return result;
      }
      assert(typeof params.threadId==='string','请选择已关联的聊天。');
      if(action==='read')return conversations.read(params.threadId);
      if(action==='history')return conversations.history({threadId:params.threadId,offset:params.offset,limit:params.limit,version:params.version});
      if(action==='events')return conversations.events(params.threadId,params.afterVersion);
      if(action==='openDesktop')return conversations.openDesktop(params.threadId);
      if(['send','interrupt','answer'].includes(action)){
        const input={...params};delete input.name;delete input.scope;
        await remember({threadId:params.threadId,operationId:params.operationId});
        return conversations[action](input);
      }
      throw new Error('应用不支持此会话操作。');
    }
    if(method==='list'){
      const result=await cli(['project','list','--scope','all']);
      return {projects:result.data.projects??[],warnings:(result.errors??[]).map(e=>`${e.target??''}：${e.message}`)};
    }
    if(method==='detail')return detail(params);
    if(method==='context-files'){
      if(params.action!=='endReview')key(params);
      if(params.reviewSession)reviewSessions.add(params.reviewSession);
      if(params.action==='endReview')reviewSessions.delete(params.reviewSession);
      try { return await context.services.call('projects','contextFiles',[{...params,reviewOwnerPid:process.pid}]); }
      catch(error){
        if(error.code==='APP_SERVICE_UNKNOWN'&&params.action==='changes')return {supported:false};
        throw error;
      }
    }
    if(method==='project-context-list')return projectContextList(params);
    if(method==='activity'){
      const {name,scope,timeZone}=key(params);
      await project({name,scope});
      return context.services.call('projects','activity',[{name,scope,timeZone}]);
    }
    if(method==='chats'){
      key(params);await project(params);const offset=Number(params.offset??0);assert(Number.isSafeInteger(offset)&&offset>=0,'分页位置无效。');
      const result=await cli(['task','list','--target',`${params.scope}:${params.name}`,'--limit','20','--offset',String(offset)]);
      return {total:result.data.total??0,nextOffset:result.data.nextOffset,records:(result.data.records??[]).map(r=>({taskId:r.taskId,title:r.title,updatedAt:r.targetContext?.latestReported?.reportedAt??r.updatedAt,turnId:r.targetContext?.latestTurnId,turnCount:r.targetContext?.turnCount??0,summary:r.targetContext?.latestReported?.route?.summary??''})),warnings:(result.errors??[]).map(e=>e.message)};
    }
    if(method==='file'){
      const p=await project(params);let path=string(params.path),version;
      if((p.metadata?.archive_history?.length||p.metadata?.task_numbering_history?.length)||params.digest){version=await lifecycle('resolve',{path,digest:params.digest,read:!!params.digest});path=version.path;}
      if(!inside(resolve(root,p.directory),resolve(root,path))){
        assert(params.digest,'请从该项目的原文件入口打开。');
        const state=await governance('read',{name:params.name,scope:params.scope});
        assert(state.project&&projectPlanReferences(state,state.project).results.some(ref=>ref.path===params.path&&ref.digest===params.digest),'此文件不是当前项目已引用的固定版本证据。');
      }
      const historical=version?.historical??false;
      let text;
      if(typeof version?.contentBase64==='string'){
        await safePath(path);
        const bytes=Buffer.from(version.contentBase64,'base64');assert(bytes.length<=MAX_TEXT,'文档超过2 MB，请从原文件入口查看。');
        const extension=extname(path).toLowerCase(),images={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'};
        if(images[extension]||!/^\.(?:md|markdown|txt|json|ya?ml|[cm]?js|tsx?|css|html|csv|toml|ini)$/i.test(extension)){
          return {path,body:'',metadata:{},links:[],historical,preview:{kind:images[extension]?'image':'download',mimeType:images[extension]??'application/octet-stream',base64:version.contentBase64}};
        }
        text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      }else text=await textFile(path);
      if(params.raw===true)return {path,body:text,metadata:{},links:[],historical};
      const parsed=parseDocument(text);
      let refs=links(parsed.body,path);
      if(p.metadata?.archive_history?.length||p.metadata?.task_numbering_history?.length)refs=await relocatedLinks(refs);
      return {path,body:parsed.body,metadata:parsed.metadata,links:refs,historical};
    }
    if(method==='preferences.read')return readPreferences();
    if(method==='preferences.save'){
      assert(typeof params.selected==='string'&&params.selected.length<500&&['overview','plan','work','governance','tasks','chats','resources'].includes(params.tab),'显示设置无效。');
      return updatePreferences(value=>({...value,selected:params.selected,tab:params.tab}));
    }
    if(method==='preferences.pin'){
      const {name,scope,pinned}=key(params);
      assert(typeof pinned==='boolean','请选择固定或取消固定。');
      if(pinned)await project({name,scope});
      return updatePreferences(value=>{
        const target=scope+':'+name;
        const pinnedProjects=new Set(value.pinnedProjects??[]);
        if(pinnedProjects.has(target)===pinned)return value;
        if(pinned)pinnedProjects.add(target);
        else pinnedProjects.delete(target);
        return {...value,pinnedProjects:[...pinnedProjects]};
      });
    }
    throw new Error('应用不支持此操作。');
  }
  return {call,async dispose(){disposed=true;for(const c of children)c.kill();await writes.catch(()=>{});await briefs.dispose();
    await Promise.allSettled([...reviewSessions].map(reviewSession=>context.services.call('projects','contextFiles',[{action:'endReview',reviewSession}])));}};
}
export async function activate(context){return createBackend(context);}
