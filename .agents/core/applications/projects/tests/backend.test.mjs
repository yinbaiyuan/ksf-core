import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createBackend,parseDocument,sections} from '../backend.mjs';

async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'ksf-projects-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'项目/示例/任务'),{recursive:true});
  await mkdir(join(root,'项目/其他'),{recursive:true});
  const calls=[];const p={name:'示例',scope:'current',directory:'项目/示例',path:'项目/示例/project.md',metadata:{name:'示例项目',status:'active',updated:'2026-10-26',topics:['设计'],repositories:[]},body:'# 示例\n\n## 项目目标\n完成真实工作。\n\n[计划](任务/推进.md)\n[资料](资料/原件.md)\n[外部](https://example.com)'};
  const cli=async args=>{calls.push(args);if(args[0]==='project'&&args[1]==='read')return {data:{project:p},errors:[]};if(args[0]==='project')return {data:{projects:[{name:'示例',title:'示例项目',scope:'current'}]},errors:[]};return {data:{total:23,nextOffset:20,records:[{taskId:'a'.repeat(64),title:'已有聊天',updatedAt:'2026-10-26',targetContext:{turnCount:2,latestTurnId:'native-1',latestReported:{route:{summary:'明确记录的进展'},reportedAt:'2026-10-25'}}}]},errors:[]};};
  const app=createBackend({workspace:root,dataDirectory:join(root,'.app-data')},{cli});t.after(()=>app.dispose());
  return {root,app,calls,p,params:{name:'示例',scope:'current'}};
}

test('检查点按明示状态读取，普通任务文档和未来格式不猜测状态',async t=>{
  const {root,app,params}=await fixture(t);
  await writeFile(join(root,'项目/示例/任务/推进.md'),'---\ncheckpoint_schema: 1\ntask_id: a\nname: 推进\nstate: in_progress\nupdated: "2026-10-26"\n---\n# 推进\n## 待决项与下一步\n等待原件。');
  await writeFile(join(root,'项目/示例/任务/历史.md'),'---\ncheckpoint_schema: 1\nstate: completed\n---\n# 已完成');
  await writeFile(join(root,'项目/示例/任务/旧记录.md'),'# 旧记录\n已完成全部任务。');
  await writeFile(join(root,'项目/示例/任务/未来.md'),'---\ncheckpoint_schema: 2\nstate: completed\n---\n# 未来');
  const result=await app.call('detail',params);
  assert.equal(result.tasks.length,4);assert.equal(result.tasks[0].state,'in_progress');assert.equal(result.tasks[0].next[0].body,'等待原件。');
  assert.equal(result.tasks.find(x=>x.name==='旧记录').state,'unknown');assert.equal(result.tasks.find(x=>x.name==='未来').schema,'unsupported');
  assert.equal(result.resources.find(r=>r.title==='资料').path,'项目/示例/资料/原件.md');assert.equal(result.resources.find(r=>r.title==='外部').url,'https://example.com');
  assert.equal((await readFile(join(root,'项目/示例/任务/旧记录.md'),'utf8')),'# 旧记录\n已完成全部任务。');
});

test('部分损坏不使正常任务消失；缺少任务目录为正常空态',async t=>{
  const {root,app,params}=await fixture(t);await writeFile(join(root,'项目/示例/任务/损坏.md'),'---\nx: 1\nx: 2\n---\n正文');
  await writeFile(join(root,'项目/示例/任务/正常.md'),'# 正常');const result=await app.call('detail',params);assert.equal(result.tasks.length,1);assert.equal(result.warnings.length,1);
  await rm(join(root,'项目/示例/任务'),{recursive:true});const empty=await app.call('detail',params);assert.deepEqual(empty.tasks,[]);assert.deepEqual(empty.warnings,[]);
});

test('文件预览限制在所选项目且拒绝路径越界、符号链接和大文件',async t=>{
  const {root,app,params}=await fixture(t);await writeFile(join(root,'项目/示例/原文.md'),'# 原文');
  assert.equal((await app.call('file',{...params,path:'项目/示例/原文.md'})).body,'# 原文');
  await assert.rejects(app.call('file',{...params,path:'项目/其他/a.md'}));await assert.rejects(app.call('file',{...params,path:'../../secret'}));
  await symlink(join(root,'项目/示例/原文.md'),join(root,'项目/示例/链接.md'));await assert.rejects(app.call('file',{...params,path:'项目/示例/链接.md'}),/符号链接/);
  await writeFile(join(root,'项目/示例/大.md'),'x'.repeat(2*1024*1024+1));await assert.rejects(app.call('file',{...params,path:'项目/示例/大.md'}),/2 MB/);
});

test('聊天查询使用明确项目归属与分页参数，返回项目内的默认轮次',async t=>{
  const {app,calls,params}=await fixture(t);const result=await app.call('chats',{...params,offset:20});
  assert.deepEqual(calls.at(-1),['task','list','--target','current:示例','--limit','20','--offset','20']);assert.equal(result.records[0].turnId,'native-1');assert.equal(result.records[0].summary,'明确记录的进展');assert.equal(result.total,23);
  await assert.rejects(app.call('chats',{...params,offset:-1}));await assert.rejects(app.call('detail',{name:'../其他',scope:'current'}));
});

test('显示设置重开保留，串行保存不会留下半文件，关闭后拒绝调用',async t=>{
  const {app,root}=await fixture(t);assert.equal((await app.call('preferences.read')).schemaVersion,1);
  await Promise.all([app.call('preferences.save',{selected:'current:示例',tab:'overview'}),app.call('preferences.save',{selected:'current:示例',tab:'tasks'})]);
  const reopened=createBackend({workspace:root,dataDirectory:join(root,'.app-data')});assert.equal((await reopened.call('preferences.read')).tab,'tasks');await reopened.dispose();
  await app.dispose();await assert.rejects(app.call('list'),/已关闭/);
});

test('Markdown 元数据和章节解析不把代码块标题当作真实章节',()=>{
  assert.equal(parseDocument('\uFEFF---\r\nname: 示例\r\n---\r\n# 正文').body,'# 正文');
  assert.throws(()=>parseDocument('---\nx: &a [1]\ny: *a\n---\n正文'),/锚点/);
  assert.deepEqual(sections('# 项目\n```md\n## 假标题\n```\n## 下一步\n读取原文。').map(x=>x.title),['项目','下一步']);
});
test('SDK v1 对话代理保留原文和操作号，多窗口恢复各自的原生线程',async t=>{
  const root=await mkdtemp(join(tmpdir(),'ksf-project-conversation-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const calls=[],params={name:'虚构项目',scope:'current'};
  const context={workspace:root,dataDirectory:join(root,'data'),services:{async call(service,method,[input]){calls.push({service,method,input});if(method==='create')return{operationId:input.operationId,status:'queued',threadId:'thread-'+input.operationId};if(method==='attach')return{attached:false,reason:'无法核验'};return{available:true};}}};
  const app=createBackend(context,{cli:async()=>({data:{project:{name:params.name,scope:'current'}}})});t.after(()=>app.dispose());
  const one={surfaceId:'window-one'},two={surfaceId:'window-two'};
  await app.call('conversation.create',{...params,operationId:'operation-one',text:'原文\r\n  空格'},one);
  await app.call('conversation.create',{...params,operationId:'operation-two',text:'第二条'},two);
  assert.equal((await app.call('conversation.resume',params,one)).threadId,'thread-operation-one');
  assert.equal((await app.call('conversation.resume',params,two)).threadId,'thread-operation-two');
  assert.equal(calls[0].service,'codex-conversations');assert.equal(calls[0].input.text,'原文\r\n  空格');assert.deepEqual(calls[0].input.project,params);
  const rejected=await app.call('conversation.attach',{...params,taskId:'unmatched'},one);assert.equal(rejected.attached,false);assert.equal((await app.call('conversation.resume',params,one)).threadId,'thread-operation-one');
  const text=await readFile(join(root,'data/conversations.json'),'utf8');assert.ok(!text.includes('空格'));
});
