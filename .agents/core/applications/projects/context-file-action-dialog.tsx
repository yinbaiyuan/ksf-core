import {useEffect,useRef,useState} from 'react';
import {Folder,ArrowUp} from 'lucide-react';
import {Dialog} from '@ksf/sdk/dialog';
import {Button} from '@ksf/sdk/button';
import {TextField} from '@ksf/sdk/text-field';
import {Breadcrumb} from '@ksf/sdk/breadcrumb';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {InlineAlert} from '@ksf/sdk/inline-alert';
import {ScrollArea} from '@ksf/sdk/scroll-area';
import type {FileInfo} from '@ksf/sdk/files';
import {fileParent,fileName,fileWithin,renameTarget,moveTarget} from './context-file-actions.js';

export function ContextFileActionDialog({actions,state,files,root}:{actions:any;state:any;files:any;root:string}){
 const dialog=state.dialog,source=dialog.source,kind=dialog.kind,blocked=state.busy||!!state.unknown;
 const [name,setName]=useState(fileName(source.path)),[folder,setFolder]=useState(fileParent(source.path)),[listing,setListing]=useState<{path:string;entries:FileInfo[];error:string;loading:boolean}>({path:'',entries:[],error:'',loading:true}),[revision,setRevision]=useState(0);
 const nameInput=useRef<HTMLInputElement>(null),cancel=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(kind==='rename')nameInput.current?.select();},[kind]);
 useEffect(()=>{if(kind!=='move')return;let current=true;setListing({path:folder,entries:[],error:'',loading:true});
  void files.list({scope:'workspace',path:folder}).then((value:any)=>{if(current)setListing({path:folder,entries:value.entries.filter((entry:FileInfo)=>entry.kind==='directory'&&fileWithin(entry.path,root)&&!(source.kind==='directory'&&fileWithin(entry.path,source.path))),error:'',loading:false});}).catch((error:any)=>{if(current)setListing({path:folder,entries:[],error:error.message,loading:false});});
  return()=>{current=false;};
 },[files,folder,kind,root,source.path,source.kind,revision]);
 let destination='',validation='';try{destination=kind==='rename'?renameTarget(source.path,name):kind==='move'?moveTarget(source,folder,root):'';}catch(error:any){validation=error.message;}
 const title=kind==='rename'?'重命名':kind==='move'?'移动到…':'删除'+(source.kind==='directory'?'文件夹':'文件');
 const label=kind==='rename'?'保存名称':kind==='move'?'移动到此文件夹':'移入回收站';
 const canConfirm=!blocked&&!validation&&(kind==='delete'||destination!==source.path)&&(kind!=='move'||listing.path===folder&&!listing.loading&&!listing.error);
 const submit=()=>{if(canConfirm)void actions.commit(destination);};
 const relative=folder.slice(root.length).split('/').filter(Boolean),segments=[root,...relative.map((_:string,index:number)=>root+'/'+relative.slice(0,index+1).join('/'))];
 return <Dialog open title={title} width={kind==='move'?620:480} centered closeOnOutside={false} initialFocus={kind==='rename'?nameInput:cancel} onClose={()=>actions.close()} footer={<><Button ref={cancel} disabled={blocked} onClick={()=>actions.close()}>取消</Button><Button variant="solid" tone={kind==='delete'?'danger':'primary'} disabled={!canConfirm} loading={state.busy} onClick={submit}>{label}</Button></>}>
  <div className="project-file-operation">
   <p className="project-muted project-file-operation-path">{source.path}</p>
   {kind==='rename'&&<form onSubmit={event=>{event.preventDefault();submit();}}><TextField ref={nameInput} label="新名称" value={name} disabled={blocked} onValueChange={setName}/><p className="project-muted">只修改名称，文件位置保持不变。</p></form>}
   {kind==='move'&&<>
    <div className="project-actions"><Button size="small" icon={<ArrowUp size={14}/>} disabled={blocked||folder===root} onClick={()=>setFolder(fileParent(folder))}>上一级</Button><Button size="small" disabled={blocked||folder===root} onClick={()=>setFolder(root)}>项目根目录</Button></div>
    <Breadcrumb label="目标文件夹路径" items={segments.map((path:string,index:number)=>({label:index===0?fileName(root):fileName(path),onClick:!blocked&&index<segments.length-1?()=>setFolder(path):undefined}))}/>
    <ScrollArea label="目标文件夹" className="project-move-folders">
     {listing.path!==folder||listing.loading?<p role="status">正在读取文件夹…</p>:listing.error?<InlineAlert tone="error">{listing.error}<Button size="small" onClick={()=>setRevision(value=>value+1)}>重试</Button></InlineAlert>:<><NavigationList label="可进入的文件夹" items={listing.entries.map(entry=>({id:entry.path,label:fileName(entry.path),icon:<Folder size={16}/>,disabled:blocked}))} onSelect={setFolder}/>{!listing.entries.length&&<p className="project-muted">此处没有子文件夹，可直接选择当前位置。</p>}</>}
    </ScrollArea>
    <div className="project-move-target"><span className="project-muted">移动后</span><p className="project-file-operation-path">{destination||folder}</p></div>
    {destination===source.path&&<p className="project-muted">请选择其他文件夹。</p>}
   </>}
   {kind==='delete'&&<p>{source.kind==='directory'?'此文件夹及其内容将':'此文件将'}移入 KSF 回收站，完成后可撤销删除。</p>}
   {validation&&<InlineAlert tone="warning">{validation}</InlineAlert>}
   {state.unknown&&<InlineAlert tone="warning" heading="操作结果待核对"><p>请先核对原操作，避免重复执行。</p><p className="project-file-operation-path">{state.unknown.id}</p><Button disabled={state.busy} onClick={()=>void actions.reconcile()}>查询原操作结果</Button></InlineAlert>}
   {state.error&&<InlineAlert tone="error">{state.error}</InlineAlert>}
  </div>
 </Dialog>;
}
