import {useEffect,useState} from 'react';
import {createWorkbenchClient} from '../apps/request-client';
import './pairing-notifications.css';
type Request={requestId:string;appId:string;appName?:string;name:string;host:string;code:string;direction:string;status:string};
const client=createWorkbenchClient();
export function PairingNotifications(){
 const [requests,setRequests]=useState<Request[]>([]),[busy,setBusy]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let alive=true,running=false;const load=async()=>{if(running||document.hidden)return;running=true;try{const rows=await client.request<Request[]>('/api/communication/pairings');if(alive)setRequests(rows);}catch{/* An unavailable backend is handled by the workbench health indicator. */}finally{running=false;}};void load();const timer=setInterval(()=>{void load();},2500);document.addEventListener('visibilitychange',load);return()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',load);};},[]);
 const pending=requests.filter(r=>r.direction==='incoming'&&['pending','accepting','confirming'].includes(r.status));
 async function answer(requestId:string,accept:boolean){setBusy(requestId);setError('');try{await client.request('/api/communication/pairing.answer',{requestId,accept});setRequests(rows=>rows.filter(r=>r.requestId!==requestId));}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 if(!pending.length)return null;
 return <section className="ksf-pairing-notifications" aria-label="待处理配对请求" aria-live="polite"><h2>新的配对请求</h2>{pending.map(r=><article key={r.requestId}><strong>{r.name}</strong><span>{r.host} · {r.appName??'应用通信'}</span><small>核对码 {r.code}。同意后允许此应用收发消息、附件和后台收件。</small><div><button disabled={!!busy||r.status!=='pending'} onClick={()=>void answer(r.requestId,false)}>拒绝</button><button className="ksf-pairing-accept" disabled={!!busy} onClick={()=>void answer(r.requestId,true)}>{busy===r.requestId?'处理中…':r.status==='pending'?'同意配对':'重试确认'}</button></div></article>)}{error&&<p role="alert">{error}</p>}</section>;
}
