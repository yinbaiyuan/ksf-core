import {rootIdentifierPrefix} from './root-identifier';
import React,{useEffect,useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {Sheet} from './components/ui/sheet';
import type {ApplicationSDK} from './application-sdk';
import type {FileClient,FileInfo,FilePickerOptions,FileRef} from './files';
import {WindowContext} from './window-context';
import {SurfaceScopeContext} from './surface-context';
import {applicationScope} from './surface-scope.js';
type Host=Pick<ApplicationSDK,'getSnapshot'|'subscribe'|'appId'|'version'|'instanceId'|'overlays'>;
/** A picker only returns a location. It never opens a write transaction. */
export function pickFile(sdk:Host,files:FileClient,mode:'file'|'directory'|'save',options:FilePickerOptions={}):Promise<FileRef|null>{
 const snapshot=sdk.getSnapshot(),parent=snapshot.overlayHost??snapshot.contentHost??snapshot.root?.current;
 if(!parent)return Promise.reject(Error('当前界面不支持文件选择器。'));
 return new Promise(resolve=>{
  const container=document.createElement('div');parent.append(container);const root=createRoot(container,{identifierPrefix:rootIdentifierPrefix(snapshot.id,'file-dialog')});let done=false;let observer:MutationObserver|undefined;
  const finish=(ref:FileRef|null)=>{if(done)return;done=true;observer?.disconnect();resolve(ref);queueMicrotask(()=>{root.unmount();container.remove();});};
  function Picker(){
   const [path,setPath]=useState(options.initialPath??''),[name,setName]=useState(options.suggestedName??''),[entries,setEntries]=useState<FileInfo[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState<FileRef|null>(null),[folder,setFolder]=useState(''),[revision,setRevision]=useState(0);
   const scope=options.scope??'workspace';
   useEffect(()=>{let active=true;setError('');void files.list({scope,path}).then(result=>{if(active)setEntries(result.entries);},error=>{if(active)setError(error.message);});return()=>{active=false;};},[path,revision]);
   const accept=async()=>{setBusy(true);setError('');try{
    if(mode==='directory'){finish({scope,path});return;}
    if(mode==='file'){if(selected)finish(selected);return;}
    if(!name||name==='.'||name==='..'||/[\\/\x00-\x1f]/.test(name))throw Error('请输入有效文件名。');
    const target={scope,path:[path,name].filter(Boolean).join('/')};if(await files.exists(target))throw Error('同名文件已存在，请更换文件名；修改原文件请从编辑入口保存。');finish(target);
   }catch(error){setError((error as Error).message);}finally{setBusy(false);}};
   const createFolder=async()=>{setError('');try{if(!folder||/[\\/]/.test(folder))throw Error('请输入单层目录名称。');await files.mkdir({ref:{scope,path:[path,folder].filter(Boolean).join('/')}});setFolder('');setRevision(v=>v+1);}catch(error){setError((error as Error).message);}};
   return <Sheet open onOpenChange={open=>{if(!open)finish(null);}} title={options.title??(mode==='save'?'选择保存位置':mode==='directory'?'选择目录':'选择文件')} solid>
    <div style={{display:'grid',gap:12,minWidth:0}}><div style={{display:'flex',gap:8}}><button type="button" disabled={!path||path===(options.rootPath??'')} onClick={()=>{setPath(path.split('/').slice(0,-1).join('/'));setSelected(null);}}>上一级</button><span style={{overflowWrap:'anywhere'}}>{path||'KSF 根目录'}</span></div>
     <div role="listbox" aria-label="目录内容" style={{maxHeight:'45vh',overflow:'auto',display:'grid',gap:4}}>{entries.filter(entry=>entry.kind==='directory'||mode!=='directory'&&(!options.extensions?.length||options.extensions.some(ext=>entry.path.toLowerCase().endsWith(ext.toLowerCase())))).map(entry=><button key={entry.path} type="button" role="option" aria-selected={selected?.path===entry.path} onClick={()=>{if(entry.kind==='directory'){setPath(entry.path);setSelected(null);}else if(mode==='save')setName(entry.path.split('/').at(-1)??'');else setSelected(entry.ref);}}>{entry.kind==='directory'?'📁 ':'📄 '}{entry.path.split('/').at(-1)}</button>)}</div>
     <div style={{display:'flex',gap:8}}><input aria-label="新建目录名称" placeholder="新建目录名称" value={folder} onChange={e=>setFolder(e.target.value)} style={{minWidth:0,flex:1}}/><button type="button" disabled={!folder} onClick={()=>void createFolder()}>新建目录</button></div>
     {mode==='save'&&<label>文件名<input autoFocus value={name} onChange={e=>setName(e.target.value)} style={{width:'100%',boxSizing:'border-box'}}/></label>}
     {error&&<p role="alert">{error}</p>}<div style={{display:'flex',justifyContent:'flex-end',gap:8}}><button type="button" onClick={()=>finish(null)}>取消</button><button type="button" disabled={busy||mode==='file'&&!selected} onClick={()=>void accept()}>{mode==='save'?'选择保存位置':'选择'}</button></div>
    </div>
   </Sheet>;
  }
  function Boundary(){const state=useSyncExternalStore(sdk.subscribe,sdk.getSnapshot);return <SurfaceScopeContext.Provider value={applicationScope(sdk.appId,sdk.version)}><WindowContext.Provider value={{id:state.id,active:state.active,enabled:state.enabled,root:state.root,toolbarHost:state.toolbarHost,overlayHost:state.overlayHost??null,contentHost:state.contentHost??null,setObject:null,session:undefined,overlays:sdk.overlays,registerMenu:undefined,registerSettings:undefined}}><Picker/></WindowContext.Provider></SurfaceScopeContext.Provider>;}
  observer=new MutationObserver(()=>{if(!parent.isConnected)finish(null);});observer.observe(document.documentElement,{childList:true,subtree:true});
  root.render(<Boundary/>);
 });
}
