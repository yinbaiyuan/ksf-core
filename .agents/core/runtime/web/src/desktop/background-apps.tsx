import {useEffect,useState,type KeyboardEvent} from 'react';
import {Activity,Ellipsis} from 'lucide-react';
import {useRemote} from '../api';
import {ApplicationIcon} from '../apps/application-icon';
import {applicationShortcuts,apps} from './registry';
import {runningBackgroundApplications,backgroundIconSlots,type BackgroundSnapshot,type BackgroundApplication} from './background-apps-model';

export function BackgroundApps({openApp,monitor}:{openApp:(id:string)=>void;monitor:()=>void}){
 const state=useRemote<BackgroundSnapshot>('/api/runtime/apps'),[slots,setSlots]=useState(()=>backgroundIconSlots(innerWidth));
 useEffect(()=>{const resize=()=>setSlots(backgroundIconSlots(innerWidth));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 const running=runningBackgroundApplications(state.data),visible=running.length>slots?running.slice(0,slots-1):running,overflow=running.slice(visible.length),definitions=applicationShortcuts();
 const key=(event:KeyboardEvent<HTMLDivElement>)=>{
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();
  const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=items.indexOf(document.activeElement as HTMLButtonElement);
  items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
 };
 const actions=(app:BackgroundApplication)=><><h3>{app.name}</h3><p className="background-state">{state.error?'状态未知 · 等待重新连接':`后台运行中 · ${app.lifecycle==='resident'?'常驻':'按需'}`}</p>{app.hasWindow&&apps.some(item=>item.id===app.id)&&<button role="menuitem" onClick={()=>openApp(app.id)}>打开应用</button>}<button role="menuitem" onClick={monitor}><Activity size={14}/>活动监视器</button></>;
 return <div className={`background-apps ${state.error?'is-stale':''}`} aria-label="后台运行的应用">
  {visible.map(app=><details className="os-menu background-app-menu" key={app.id} data-background-app={app.id}>
   <summary aria-label={`${app.name} · ${state.error?'后台状态未知':'后台运行中'}`} title={`${app.name} · ${state.error?'状态未知':'后台运行中'}`}><ApplicationIcon appId={app.id} manifest={definitions.find(item=>item.id===app.id)?.release?.manifest} variant="status"/></summary>
   <div role="menu" aria-label={`${app.name}后台状态`} onKeyDown={key}>{actions(app)}</div>
  </details>)}
  {!!overflow.length&&<details className="os-menu background-app-menu"><summary aria-label={`更多后台应用，${overflow.length} 个`} title={`更多后台应用（${overflow.length}）`}><Ellipsis size={18}/></summary><div role="menu" aria-label="更多后台应用" onKeyDown={key}>{overflow.map(app=><section key={app.id} data-background-app={app.id}>{actions(app)}</section>)}</div></details>}
  {state.error&&!running.length&&<span className="background-unknown" role="status" title="后台状态未知，等待重新连接" aria-label="后台状态未知">?</span>}
 </div>;
}
