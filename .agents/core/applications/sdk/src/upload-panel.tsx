import {forwardRef,useEffect,useRef,useState,type HTMLAttributes} from 'react';
import Source,{type QueueItem} from './fidelity/kokonut/file-upload';
import {FidelityScope} from './fidelity/scope';
import {validateFiles,type FileRules,type FileRejection} from './uploads/file-model';
import {useElementRef} from './primitives/state';
import type {Attachment,UploadQueue} from './uploads/upload-controls';
export interface UploadPanelProps extends Omit<HTMLAttributes<HTMLDivElement>,'onChange'>,FileRules {
 label:string;queue:UploadQueue<any>;disabled?:boolean;multiple?:boolean;
 onPick?:()=>Promise<readonly Attachment[]|null>;onPickError?:(error:unknown)=>void;
 onReject?:(files:readonly FileRejection<Attachment|File>[])=>void;
}
/** Optional Kokonut presentation backed exclusively by the KSF upload queue. */
export const UploadPanel=forwardRef<HTMLDivElement,UploadPanelProps>(function UploadPanel({label,queue,disabled=false,multiple=true,accept,maxSize=5*1024*1024,maxFiles=5,onPick,onPickError,onReject,...props},ref){
 const [root,assign]=useElementRef(ref),[rejected,setRejected]=useState<{id:string;file:Attachment|File;message:string}[]>([]),[notice,setNotice]=useState<string|null>(null),[picking,setPicking]=useState(false),sequence=useRef(0),request=useRef(0),alive=useRef(true),busy=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current++;};},[]);
 const receive=(files:readonly (Attachment|File)[])=>{if(disabled||!files.length)return;const valid=validateFiles(files.map(file=>({name:file.name,size:file.size??0,type:file.type??'',original:file})),{accept,maxSize,maxFiles:multiple?maxFiles:1},multiple?queue.items.length:0);const failures:FileRejection<Attachment|File>[]=valid.rejected.map(x=>({...x,file:x.file.original}));const accepted=valid.accepted.filter(x=>{if(x.original.size===undefined&&maxSize!==undefined){failures.push({file:x.original,reason:'size',message:'文件大小未知，请由文件服务补齐元数据。'});return false;}return true;}).map(x=>x.original);
  if(accepted.length){if(!multiple)queue.clear();queue.add(accepted);}
  if(failures.length){setRejected(old=>[...old,...failures.map(x=>({id:`rejected-${++sequence.current}`,file:x.file,message:x.message}))]);onReject?.(failures);}
  setNotice(failures.length?`${failures.length} file${failures.length===1?' was':'s were'} not added.`:null);
 };
 const pick=async()=>{if(disabled||busy.current||!onPick)return;busy.current=true;setPicking(true);setNotice(null);const serial=++request.current;try{const files=await onPick();if(alive.current&&serial===request.current&&files)receive(files);}catch(error){if(alive.current&&serial===request.current){setNotice('文件选择失败，请重试。');onPickError?.(error);}}finally{busy.current=false;if(alive.current&&serial===request.current)setPicking(false);}};
 const items:QueueItem[]=[...queue.items.map((item,index)=>({id:item.id,file:{name:item.name,size:item.size,type:item.type??''},sourceFile:item.file,index,status:(item.status==='done'?'done':item.status==='failed'||item.status==='canceled'?'error':item.status==='uploading'?'uploading':'queued') as QueueItem['status'],progress:item.progress,attempts:0,error:item.error||item.status==='canceled'?{code:'TRANSFER',message:item.error??'已取消'}:undefined,previewUrl:item.thumbnail})),...rejected.map((item,index)=>({id:item.id,file:{name:item.file.name,size:item.file.size,type:item.file.type??''},index:queue.items.length+index,status:'rejected' as const,progress:0,attempts:0,error:{code:'VALIDATION',message:item.message}}))];
 return <div {...props} ref={assign} role="group" aria-label={label} aria-busy={picking||undefined} style={{width:'100%',maxWidth:384,minWidth:0,...props.style}}><FidelityScope module="file-upload" paused={disabled}><Source items={items} disabled={disabled||picking} notice={notice} acceptedFileTypes={accept?.split(',').map(x=>x.trim()).filter(Boolean)} maxFileSize={maxSize} maxFiles={maxFiles} multiple={multiple} onFiles={receive} onPick={onPick?()=>void pick():undefined} onRemove={id=>{queue.remove(id);setRejected(x=>x.filter(i=>i.id!==id));setNotice(null);}} onRetry={queue.retry} onClear={()=>{queue.clear();setRejected([]);setNotice(null);}}/></FidelityScope></div>;
});
