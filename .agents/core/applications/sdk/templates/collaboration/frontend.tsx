import {useEffect,useMemo,useRef,useState} from 'react';
import {mountReact,useApplicationSDK} from '@ksf/sdk/react';
import {createMessageMaterialClient,createPeerPairingClient,type MessageMaterial,type MessagePart,type PeerDirectory} from '@ksf/sdk/communication';
import {randomId} from '@ksf/sdk/random-id';
import './style.css';

type Attachment=MessagePart&{messageId:string};
type Request={requestId:string;taskId:string;status:string;text?:string;messageId?:string;from?:{nodeId:string};attachments?:Attachment[];result?:{text:string};feedback?:{text:string;attachments?:Attachment[]}};
type State={tasks:Record<string,{taskId:string;title:string;rounds:string[]}>;requests:Record<string,Request>;operations:Record<string,{outbox?:{operationId:string}}>};
const labels:Record<string,string>={received:'待你决定',accepted:'本地处理中',ignored:'已在本地忽略',completed:'已在本地完成，尚未回传','feedback-sent':'已提交回传，请核对送达',waiting:'已保存发送意图，可核对投递',review:'收到回复',approved:'旧反馈已确认'};
function App(){
 const sdk=useApplicationSDK(),materials=useMemo(()=>createMessageMaterialClient(sdk),[sdk]),pairing=useMemo(()=>createPeerPairingClient(sdk),[sdk]);
 const [state,setState]=useState<State|null>(null),[directory,setDirectory]=useState<PeerDirectory|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [title,setTitle]=useState(''),[text,setText]=useState(''),[node,setNode]=useState(''),[files,setFiles]=useState<MessageMaterial[]>([]),[results,setResults]=useState<Record<string,string>>({}),[resultFiles,setResultFiles]=useState<Record<string,MessageMaterial[]>>({});
 const upload=useRef<AbortController|null>(null),inFlight=useRef(false),alive=useRef(true);
 const operations=useRef<Record<string,{signature:string;operationId:string}>>((sdk.session.get('operations')??{}) as Record<string,{signature:string;operationId:string}>);
 async function load(){const [next,peers]=await Promise.all([sdk.call<State>('inspect'),sdk.call<PeerDirectory>('peers')]);if(alive.current){setState(next);setDirectory(peers);}}
 useEffect(()=>{alive.current=true;void load().catch(e=>setError(e.message));return()=>{alive.current=false;upload.current?.abort();};},[]);
 useEffect(()=>sdk.onBeforeClose(()=>{if(upload.current){setNotice('附件上传中，请等待完成或先取消上传。');return false;}return true;}),[sdk]);
 async function act(method:string,params:Record<string,unknown>,key=method){
  if(inFlight.current)return false;inFlight.current=true;setBusy(true);setError('');setNotice('');
  try{
   const signature=JSON.stringify({method,params}),previous=operations.current[key];
   if(previous&&previous.signature!==signature)throw Error('此操作结果尚未确认，请先查询原操作，再决定后续发送。');
   const operationId=previous?.operationId??randomId();operations.current[key]={signature,operationId};sdk.session.set('operations',operations.current);
   const result=await sdk.call<{delivery?:{status:string}}>(method,{...params,operationId});
   delete operations.current[key];sdk.session.set('operations',operations.current);
   if(result.delivery&&['failed','cancelled'].includes(result.delivery.status)){if(method==='task.send')sdk.session.set('task-draft',null);setError('发送已确认失败，正文和材料保留，请检查后重新准备发送。');await load();return false;}
   setNotice(result.delivery?`发送状态：${result.delivery.status}；送达不代表对方决定处理。`:'已保存到本机，未向对方发送。');await load();return true;
  }catch(e){setError((e as Error).message);await load().catch(()=>{});return false;}
  finally{inFlight.current=false;if(alive.current)setBusy(false);}
 }
 async function chooseFiles(list:FileList|null,requestId?:string){
  if(!list?.length||inFlight.current)return;const existing=requestId?resultFiles[requestId]??[]:files;
  if(existing.length+list.length>20){setError('单次最多 20 个附件。');return;}
  const controller=new AbortController();upload.current=controller;inFlight.current=true;setBusy(true);setError('');
  try{for(const file of Array.from(list)){const material=await materials.upload(file,file.name,controller.signal);if(!alive.current)return;if(requestId)setResultFiles(old=>({...old,[requestId]:[...(old[requestId]??[]),material]}));else setFiles(old=>[...old,material]);}setNotice('附件已准备；仅在你点击发送后投递。');}
  catch(e){if(alive.current)setError(controller.signal.aborted?'上传已取消，已完成的材料保留。':(e as Error).message);}
  finally{upload.current=null;inFlight.current=false;if(alive.current)setBusy(false);}
 }
 function incomingFiles(items:Attachment[]=[]){return <ul className="team-files">{items.map(file=><li key={file.partId}><a href={materials.downloadURL(file.messageId,file.partId)} download={file.name??file.partId}>{file.name??file.partId}</a><small> {file.byteLength} 字节</small></li>)}</ul>;}
 function prepared(items:MessageMaterial[],remove:(index:number)=>void){return <ul className="team-files">{items.map((file,index)=><li key={file.materialId}>{file.name}<button disabled={busy} onClick={()=>remove(index)}>移除</button></li>)}</ul>;}
 async function sendTask(){
  if(inFlight.current||!title.trim()||!node)return;
  // Keep IDs in the window session so an uncertain response is queried, not blindly resent.
  const signature=JSON.stringify({title,text,node,files}),old=sdk.session.get('task-draft') as {signature:string;taskId:string;requestId:string}|undefined;
  if(old&&old.signature!==signature){setError('上一份任务的发送结果尚未确认，请先查询原操作。');return;}
  const draft=old??{signature,taskId:randomId(),requestId:randomId()};sdk.session.set('task-draft',draft);
  const current=await sdk.call<State>('inspect');
  if(!current.tasks[draft.taskId]&&!await act('task.create',{taskId:draft.taskId,title},'create-'+draft.taskId))return;
  if(await act('task.send',{taskId:draft.taskId,requestId:draft.requestId,to:{nodeId:node,endpoint:{kind:'app',id:sdk.appId}},text,attachments:files},'send-'+draft.requestId)){sdk.session.set('task-draft',null);setTitle('');setText('');setFiles([]);}
 }
 async function check(operationId:string){try{const result=await sdk.call<{status:string}>('send.reconcile',{operationId});setNotice(`原发送操作：${result.status}`);await load();}catch(e){setError((e as Error).message);}}
 return <div className="team-example"><header><h2>团队协作示例</h2><p>任务和材料送达后，由接收方决定是否处理。本地完成不会自动回传。</p><button disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))}>刷新收件</button></header>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <section><h3>发出任务和材料</h3><label>接收节点<select value={node} disabled={busy} onChange={e=>setNode(e.target.value)}><option value="">选择已配对节点</option>{directory?.paired.map(peer=><option key={peer.nodeId} value={peer.nodeId}>{peer.name}</option>)}</select></label><button disabled={busy||!node} onClick={()=>{setBusy(true);void pairing.request({requestId:randomId(),nodeId:node,channel:'team.workflow.v1'}).then(()=>setNotice('本应用通信请求已发送，请对方在工作台确认。')).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>请求允许本应用通信</button>
 {!!directory?.discovered.filter(peer=>!directory.paired.some(item=>item.nodeId===peer.nodeId)).length&&<div className="team-pairing">附近节点：{directory.discovered.filter(peer=>!directory.paired.some(item=>item.nodeId===peer.nodeId)).map(peer=><button key={peer.nodeId} disabled={busy} onClick={()=>{setBusy(true);void pairing.request({requestId:randomId(),nodeId:peer.nodeId,channel:'team.workflow.v1'}).then(()=>{setNotice('配对请求已发出，请对方在工作台确认。');return load();}).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>请求配对 {peer.name}</button>)}</div>}
 <label>任务标题<input value={title} disabled={busy} onChange={e=>setTitle(e.target.value)}/></label><label>任务说明、背景与要求<textarea value={text} disabled={busy} onChange={e=>setText(e.target.value)} placeholder="说明要做什么、为什么做、已有信息和期望成果；较长资料可作为附件。"/></label>
 <label>附加材料<input type="file" multiple disabled={busy} onChange={e=>{void chooseFiles(e.target.files);e.target.value='';}}/></label>{prepared(files,index=>setFiles(old=>old.filter((_,i)=>i!==index)))}<button disabled={busy||!node||!title.trim()} onClick={()=>void sendTask()}>发送给对方同应用</button></section>
 {Object.values(state?.tasks??{}).map(task=><section key={task.taskId}><h3>{task.title}</h3>{task.rounds.map(id=>{const request=state!.requests[id],value=results[id]??request.result?.text??'';return <article key={id}><strong>{labels[request.status]??request.status}</strong><small> · {id}</small>{request.from&&<p>来源节点：{request.from.nodeId}</p>}<pre>{request.text??request.feedback?.text}</pre>{incomingFiles(request.attachments??request.feedback?.attachments)}
 {request.status==='received'&&<div><button disabled={busy} onClick={()=>void act('task.accept',{requestId:id})}>继续处理</button><button disabled={busy} onClick={()=>void act('task.ignore',{requestId:id})}>忽略</button></div>}
 {request.status==='accepted'&&<div><label>本地成果<textarea value={value} disabled={busy} onChange={e=>setResults(old=>({...old,[id]:e.target.value}))}/></label><button disabled={busy} onClick={()=>void act('task.complete',{requestId:id,text:value})}>保存成果并在本地完成</button></div>}
 {request.result&&<pre>{request.result.text}</pre>}
 {['completed','feedback-sent'].includes(request.status)&&request.result&&<div><p>成果已保存在本机。需要回传时，再选择附件并点击发送。已有反馈须确认失败后才能重新发送。</p><label>结果附件<input type="file" multiple disabled={busy} onChange={e=>{void chooseFiles(e.target.files,id);e.target.value='';}}/></label>{prepared(resultFiles[id]??[],index=>setResultFiles(old=>({...old,[id]:(old[id]??[]).filter((_,i)=>i!==index)})))}<button disabled={busy||(!request.result?.text.trim()&&!(resultFiles[id]?.length))} onClick={()=>void act('task.feedback',{requestId:id,attachments:resultFiles[id]??[]},'feedback-'+id)}>发送结果给原发送方</button></div>}
 </article>;})}</section>)}
 {Object.entries(state?.operations??{}).filter(([,operation])=>operation.outbox).map(([id])=><p key={id}><small>发送操作 {id}</small> <button disabled={busy} onClick={()=>void check(id)}>核对原发送</button></p>)}
 {upload.current&&<button onClick={()=>upload.current?.abort()}>取消上传</button>}
 </div>;
}
export function mount(container:HTMLElement,sdk:Parameters<typeof mountReact>[2]){return mountReact(App,container,sdk);}
