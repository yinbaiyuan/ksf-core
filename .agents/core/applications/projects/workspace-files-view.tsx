import {useEffect,useMemo,useRef,useState} from 'react';
import {createFileTransport,pickerLocation,withinPickerRoot,type FileInfo,type FilePickerOptions,type TrashEntry} from '@ksf/sdk/files';
import {Button} from '@ksf/sdk/button';
import {Dialog} from '@ksf/sdk/dialog';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {TextField} from '@ksf/sdk/text-field';
import {FilePicker} from '@ksf/sdk/file-picker';
import {InlineAlert} from '@ksf/sdk/inline-alert';
import {ScrollArea} from '@ksf/sdk/scroll-area';

// Project-specific composition. Transport, leases, protection and operation receipts
// remain SDK/host-owned; the dialog belongs to the window's existing React tree.
export function WorkspaceFilesDialog({sdk,options,mode='pick',readOnly=false,beforeMutate,onGuard,onClose}:{sdk:any;options:FilePickerOptions;mode?:'pick'|'manage';readOnly?:boolean;beforeMutate?:()=>Promise<boolean>;onGuard?:(blocked:boolean)=>void;onClose:(selection:FileInfo|null)=>void}){
 const files=useMemo(()=>createFileTransport(sdk),[sdk]),boundary=useMemo(()=>pickerLocation(options),[options]),scope=options.scope??'workspace';
 const [path,setPath]=useState(boundary.initial),[entries,setEntries]=useState<FileInfo[]>([]),[selected,setSelected]=useState<string|null>(null),[trash,setTrash]=useState<TrashEntry[]|null>(null),[revision,setRevision]=useState(0),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[issue,setIssue]=useState(''),[notice,setNotice]=useState(''),[folder,setFolder]=useState(''),[transfer,setTransfer]=useState<{kind:'copy'|'move'|'restore';source:FileInfo|TrashEntry;destination:string}|null>(null),[confirm,setConfirm]=useState<string[]|null>(null),[unknown,setUnknown]=useState<string|null>(null);
 const inFlight=useRef(false),alive=useRef(true),entry=entries.find(e=>e.path===selected),ref={scope,path};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{onGuard?.(busy||!!unknown);return()=>onGuard?.(false);},[busy,unknown,onGuard]);
 useEffect(()=>{let current=true;setLoading(true);setIssue('');void (trash?files.listTrash().then(values=>{if(current)setTrash(values.filter(e=>e.ref.scope===scope&&withinPickerRoot(e.ref.path,boundary.root)));}):files.list({scope,path}).then(value=>{if(current)setEntries(value.entries);})).catch(e=>{if(current)setIssue(e.message);}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[files,path,scope,revision,!!trash,boundary.root]);
 useEffect(()=>files.watch({scope,path},()=>setRevision(n=>n+1)),[files,scope,path]);
 async function run(action:()=>Promise<unknown>,mutating=true){
  if(inFlight.current||mutating&&(readOnly||unknown))return;
  inFlight.current=true;setBusy(true);setIssue('');setNotice('');
  try{if(mutating&&beforeMutate&&!await beforeMutate())throw Error('请先保存或合并当前草稿。');await action();if(alive.current){setSelected(null);setRevision(n=>n+1);}}
  catch(e:any){if(alive.current){setIssue(e.message);if(e.operationId&&!['WORKSPACE_EXISTS','FILE_MOVE_INVALID','FILE_PATH_INVALID','FILE_OPERATION_INVALID','FILE_CONFIRM_REQUIRED'].includes(e.code))setUnknown(e.operationId);}}
  finally{inFlight.current=false;if(alive.current)setBusy(false);}
 }
 const destination=(value:string)=>pickerLocation({rootPath:boundary.root,initialPath:value}).initial;
 const blocked=busy||!!unknown||readOnly;
 function enter(value:string){setPath(value);setSelected(null);setTransfer(null);}
 return <Dialog open title={options.title??(mode==='pick'?'选择参考文件':'附件与文件操作')} onClose={()=>{if(inFlight.current||unknown)return false;onClose(null);}} confirmLabel={mode==='pick'?'选择文件':'关闭'} footer={<><Button disabled={busy||!!unknown} onClick={()=>onClose(null)}>取消</Button><Button variant="solid" disabled={mode==='pick'?!entry||entry.kind!=='file'||loading||busy:busy||!!unknown} onClick={()=>onClose(mode==='pick'?entry!:null)}>{mode==='pick'?'选择文件':'关闭'}</Button></>} onConfirm={()=>{if(mode==='pick'){if(entry?.kind!=='file')return false;onClose(entry);}else onClose(null);return true;}}>
  <p className="project-muted">{path||'工作区根目录'}</p>
  <div className="project-actions"><Button disabled={path===boundary.root||busy} onClick={()=>enter(path.slice(0,path.lastIndexOf('/')))}>上一级</Button><Button disabled={busy} onClick={()=>{setTrash(trash?null:[]);setSelected(null);setTransfer(null);}}>{trash?'返回文件':'回收站'}</Button><Button disabled={busy} onClick={()=>setRevision(n=>n+1)}>刷新文件</Button></div>
  {loading&&<p role="status">正在读取文件…</p>}
  {!trash?<>
   <ScrollArea label="工作区文件" style={{maxHeight:'35vh'}}><NavigationList label="工作区文件" selectedId={selected??undefined} onSelect={setSelected} items={entries.filter(e=>e.kind==='directory'||!options.extensions?.length||options.extensions.some(ext=>e.path.toLowerCase().endsWith(ext.startsWith('.')?ext:'.'+ext))).map(e=>({id:e.path,label:(e.kind==='directory'?'▸ ':'')+e.path.split('/').at(-1),onAction:()=>{setSelected(e.path);}}))}/></ScrollArea>
   {entry?.kind==='directory'&&<Button onClick={()=>enter(entry.path)}>进入所选目录</Button>}
   {entry&&<p className="project-muted">{entry.path}{entry.protection&&' · '+entry.protection.message}</p>}
   {mode==='manage'&&<>
    <div className="project-actions"><FilePicker label="导入文件" disabled={blocked} items={[]} showList={false} maxSize={128*1024*1024} onReject={values=>setIssue(values.map(v=>v.message).join('；'))} onItemsChange={values=>void run(async()=>{for(const value of values){if(value.file)await files.upload({ref:{scope,path:[path,value.name].filter(Boolean).join('/')},blob:value.file});}setNotice('文件已导入。');})}/><Button disabled={busy||entry?.kind!=='file'} onClick={()=>entry&&void run(()=>files.download(entry.ref),false)}>下载</Button><Button disabled={blocked||!entry} onClick={()=>entry&&setTransfer({kind:'copy',source:entry,destination:entry.path})}>复制到…</Button><Button disabled={blocked||!entry?.writable} onClick={()=>entry&&setTransfer({kind:'move',source:entry,destination:entry.path})}>移动或重命名…</Button><Button tone="danger" disabled={blocked||!entry?.writable} onClick={()=>entry&&void run(async()=>{await files.trash({ref:entry.ref,version:entry.version});setNotice('已移入回收站，可按原路径恢复。');})}>移入回收站</Button></div>
    <TextField label="新建目录名称" value={folder} onValueChange={setFolder}/><Button disabled={blocked||!folder.trim()} onClick={()=>void run(async()=>{if(/[\\/]/.test(folder))throw Error('请输入单层目录名称。');await files.mkdir({ref:{scope,path:destination([path,folder.trim()].filter(Boolean).join('/'))}});setFolder('');})}>新建目录</Button>
   </>}
  </>:<>
   <p className="project-muted">本机回收内容保留原路径及版本，不自动清理。</p>
   {mode==='manage'&&<Button disabled={blocked||!trash.length} tone="danger" onClick={()=>setConfirm(trash.map(e=>e.id))}>清空当前范围回收站…</Button>}
   <ScrollArea label="回收内容" style={{maxHeight:'35vh'}}>{trash.map(e=><div className="project-block" key={e.id}><p>{e.ref.path} · {e.deletedAt}</p>{mode==='manage'&&<div className="project-actions"><Button disabled={blocked} onClick={()=>void run(async()=>{await files.restore({trashId:e.id});setNotice('已恢复原路径。');})}>恢复原路径</Button><Button disabled={blocked} onClick={()=>setTransfer({kind:'restore',source:e,destination:e.ref.path})}>恢复到…</Button><Button disabled={blocked} tone="danger" onClick={()=>setConfirm([e.id])}>永久删除…</Button></div>}</div>)}</ScrollArea>
  </>}
  {transfer&&<><TextField label="目标相对路径" value={transfer.destination} onValueChange={value=>setTransfer({...transfer,destination:value})}/><div className="project-actions"><Button disabled={blocked||!transfer.destination.trim()} onClick={()=>void run(async()=>{const target={scope,path:destination(transfer.destination)};if(transfer.kind==='restore')await files.restore({trashId:(transfer.source as TrashEntry).id,destination:target});else{const source=transfer.source as FileInfo;await files[transfer.kind]({ref:source.ref,destination:target,version:source.version});}setTransfer(null);setNotice('文件操作完成。');})}>确认{transfer.kind==='copy'?'复制':transfer.kind==='move'?'移动':'恢复'}</Button><Button onClick={()=>setTransfer(null)}>取消路径操作</Button></div></>}
  {unknown&&<InlineAlert tone="warning" heading="文件操作结果待核对">操作编号：{unknown}。保留原请求，核对后再继续。<Button disabled={busy} onClick={()=>void run(async()=>{const result:any=await files.operation(unknown);if(['committed','failed','rejected','not-found','notFound'].includes(result.state)){setUnknown(null);setNotice(result.state==='committed'?'原操作已完成。':'原操作未提交，请核对文件后再操作。');}else throw Error('原操作仍未确认，请保留操作编号。');},false)}>查询原操作结果</Button></InlineAlert>}
  {notice&&<InlineAlert>{notice}</InlineAlert>}{issue&&<InlineAlert tone="error">{issue}</InlineAlert>}
  <Dialog open={!!confirm} title="确认永久删除" danger onClose={()=>{if(busy)return false;setConfirm(null);}} confirmLabel="确认永久删除" confirming={busy} onConfirm={async()=>{await run(async()=>{const result:any=await files.emptyTrash({ids:confirm!,confirm:true});setConfirm(null);const errors=result.results?.filter((r:any)=>r.error)??[];if(errors.length)throw Error(errors.map((r:any)=>r.error.message).join('；'));setNotice('已永久删除确认条目。');});return false;}}>永久删除这 {confirm?.length} 项后无法恢复。只处理本次列出的条目。</Dialog>
 </Dialog>;
}
