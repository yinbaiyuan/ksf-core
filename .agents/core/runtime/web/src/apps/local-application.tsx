import {useState} from 'react';
import {request} from './client';
import {applicationPageId,closeApplicationWindows} from './app-services';
import type {ApplicationSnapshot,InstalledApplication} from './application-model';

export function LocalApplicationDetails({app,onChange}:{app:InstalledApplication;onChange:()=>Promise<void>}){
 const [directory,setDirectory]=useState(app.local?.appDirectory??''),[project,setProject]=useState(app.local?.project??''),[repository,setRepository]=useState(app.local?.repository??''),[trusted,setTrusted]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const run=async(action:'link'|'install')=>{
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{
   if(action==='install'){
    const live=await request<ApplicationSnapshot>('/api/apps/installed');
    if(live.instances.some(i=>i.appId===app.id&&i.kind==='window'&&i.pageId!==applicationPageId))throw Error('请先关闭其他页面中的此应用窗口，以保存编辑内容。');
    if(!await closeApplicationWindows(app.id))throw Error('应用尚未完成保存，安装已取消。');
    for(let i=0;i<40;i++){if(!(await request<ApplicationSnapshot>('/api/apps/installed')).instances.some(x=>x.appId===app.id&&x.kind==='window'))break;await new Promise(resolve=>setTimeout(resolve,50));}
   }
   const result=await request<{pending?:boolean}>('/api/apps/local',{appId:app.id,action,appDirectory:directory,project,repository,trusted});
   await onChange();setMessage(result.pending?'已准备安装，保存并关闭旧窗口后完成更新。':action==='link'?'关联信息已保存。':'本地应用已更新，原有数据保留。');
  }catch(e){setError(e instanceof Error?e.message:'操作失败。');}finally{setBusy(false);}
 };
 return <details className="store-local">
  <summary>本地应用与关联</summary>
  <p>从本机应用包安装和更新。项目、仓库及源码目录均可不关联。</p>
  <p>当前版本 {app.active.manifest.version}{app.active.localBuild?` · 构建 #${app.active.localBuild.number}`:''}</p>
  <label>源码目录（可选）<input aria-label="源码目录（可选）" value={directory} onChange={e=>setDirectory(e.target.value)} placeholder="含 manifest.json 的目录" disabled={busy}/></label>
  <label>关联项目（可选）<input aria-label="关联项目（可选）" value={project} onChange={e=>setProject(e.target.value)} placeholder="当前 KSF 的项目目录名" disabled={busy}/></label>
  <label>关联仓库（可选）<input aria-label="关联仓库（可选）" value={repository} onChange={e=>setRepository(e.target.value)} placeholder="本地 Git 仓库目录" disabled={busy}/></label>
  <div className="store-detail-actions"><button className="store-get" disabled={busy} onClick={()=>void run('link')}>保存关联</button></div>
  {directory&&<><p>在源码目录生成本地构建后，可安装最新构建。发布到应用源需单独明确操作。</p><label className="store-local-trust"><input type="checkbox" checked={trusted} onChange={e=>setTrusted(e.target.checked)} disabled={busy}/>我信任这个本地应用包</label><div className="store-detail-actions"><button className="store-get" disabled={busy||!trusted||!!app.pending} onClick={()=>void run('install')}>安装最新本地构建</button></div></>}
  {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="store-dialog-error">{error}</p>}
 </details>;
}
