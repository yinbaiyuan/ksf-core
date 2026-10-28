import {useEffect,useState} from 'react';
import {createWorkbenchClient} from '../apps/request-client';
import './communication-settings.css';
type Grant={peers:string[];activation:boolean};
type Snapshot={config:{enabled:boolean;host:string;port:number;discovery:boolean;maxMessageBytes:number;maxStorageBytes:number;peers:Record<string,{nodeId:string;name:string;host:string;port:number;fingerprint:string}>;grants:Record<string,Grant>;endpoints:Record<string,{key:string;enabled:boolean;channels:string[];peers:string[]}>};identity:{nodeId:string;fingerprint:string}|null;listener:{host:string;port:number}|null;interfaces:{name:string;address:string;internal:boolean}[];discovered:{nodeId:string;host:string;port:number}[];routes:{appId:string;name:string;channel:string;enabled:boolean}[];background:{applications:Record<string,Record<string,{reason:string}>>};deliveries:{messageId:string;to:{endpoint:{id:string}};delivery:{state:string;error?:{message:string}}}[];operations:{operationId:string;status:string;error?:{message:string}}[];discoveryError?:{message:string};dispatchError?:{message:string}};
const client=createWorkbenchClient(),MiB=1024**2;
const names:Record<string,string>={pending:'等待分发',delivering:'正在分发',acknowledged:'应用已接管',suspended:'接收应用不可用',parked:'分发已暂停',delivered:'对端已完整接收',failed:'发送失败',unconfirmed:'送达状态未知',cancelled:'已取消',preparing:'准备中',sending:'发送中',confirming:'确认中'};
export function CommunicationSettingsContent(){
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[identity,setIdentity]=useState('');
 const [form,setForm]=useState({enabled:false,host:'',port:45731,discovery:true,maxMessageBytes:1024,maxStorageBytes:8192});
 const [peer,setPeer]=useState({identity:'',fingerprint:'',host:'',port:45731,name:''});
 const [grant,setGrant]=useState({route:'',peers:[] as string[],activation:false});
 const load=async(initial=false)=>{const value=await client.request<Snapshot>('/api/communication/state');setData(value);if(initial)setForm({enabled:value.config.enabled,host:value.config.host,discovery:value.config.discovery,port:value.listener?.port??(value.config.port||45731),maxMessageBytes:value.config.maxMessageBytes/MiB,maxStorageBytes:value.config.maxStorageBytes/MiB});};
 useEffect(()=>{void load(true).catch(e=>setError(e.message));},[]);
 async function act(operation:string,input:unknown,message='已保存。'){setBusy(true);setError('');setNotice('');try{await client.request('/api/communication/'+operation,input);await load();setNotice(message);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function exportIdentity(){setBusy(true);try{setIdentity(JSON.stringify(await client.request('/api/communication/identity',{}),null,2));await load();setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="communication-settings">
  <p>同一内网中的 KSF 节点直接传递消息。关闭浏览器后可继续工作，KSF Web 后端需要保持运行。</p>
  {error&&<p className="communication-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <section><h4>监听与容量</h4><form onSubmit={e=>{e.preventDefault();void act('configure',{...form,maxMessageBytes:form.maxMessageBytes*MiB,maxStorageBytes:form.maxStorageBytes*MiB},'通信设置已保存。');}}>
   <label className="communication-check"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/>启用内网通信</label>
   <label>本机网络接口<select required={form.enabled} value={form.host} onChange={e=>setForm({...form,host:e.target.value})}><option value="">选择接口</option>{data?.interfaces.map(v=><option key={v.address} value={v.address}>{v.name} · {v.address}{v.internal?'（本机测试）':''}</option>)}</select></label>
   <label>通信端口<input type="number" min="1" max="65535" value={form.port} onChange={e=>setForm({...form,port:Number(e.target.value)})}/></label>
   <label className="communication-check"><input type="checkbox" checked={form.discovery} onChange={e=>setForm({...form,discovery:e.target.checked})}/>发现同子网节点</label>
   <div className="communication-columns"><label>单条消息上限（MiB）<input type="number" min="1" max="16384" value={form.maxMessageBytes} onChange={e=>setForm({...form,maxMessageBytes:Number(e.target.value)})}/></label><label>临时接收额度（MiB）<input type="number" min={form.maxMessageBytes} value={form.maxStorageBytes} onChange={e=>setForm({...form,maxStorageBytes:Number(e.target.value)})}/></label></div>
   <button disabled={busy||!data}>保存通信设置</button>
  </form><p>{data?.listener?`正在监听 ${data.listener.host}:${data.listener.port}`:'通信监听未启用。'}</p>{data?.discoveryError&&<p role="alert">发现服务：{data.discoveryError.message}</p>}</section>
  <section><h4>本机身份</h4><p className="communication-id">节点：{data?.identity?.nodeId??'尚未创建'}</p><p className="communication-id">指纹：{data?.identity?.fingerprint??'尚未创建'}</p><button disabled={busy} onClick={()=>void exportIdentity()}>导出公共身份</button>{identity&&<label>将此公共身份交给对方配对<textarea readOnly value={identity} rows={6}/></label>}</section>
  <section><h4>节点配对</h4><p>双方分别导入对方的公共身份，核对完整指纹，并填写对方监听地址。发现节点只提供地址提示。</p>
   {!!data?.discovered.length&&<div className="communication-list">{data.discovered.map(v=><button key={v.nodeId} onClick={()=>setPeer({...peer,host:v.host,port:v.port})}>发现 {v.host}:{v.port}<small>{v.nodeId}</small></button>)}</div>}
   <form onSubmit={e=>{e.preventDefault();try{void act('trust',{...peer,identity:JSON.parse(peer.identity)},'已保存对端信任。对方也需要导入本机身份。');}catch{setError('对端公共身份需要有效 JSON。');}}}>
    <label>对端公共身份<textarea required rows={4} value={peer.identity} onChange={e=>setPeer({...peer,identity:e.target.value})}/></label>
    <label>经双方核对的完整指纹<input required value={peer.fingerprint} onChange={e=>setPeer({...peer,fingerprint:e.target.value.trim()})}/></label>
    <div className="communication-columns"><label>对端 IPv4<input required value={peer.host} onChange={e=>setPeer({...peer,host:e.target.value.trim()})}/></label><label>对端端口<input type="number" min="1" max="65535" value={peer.port} onChange={e=>setPeer({...peer,port:Number(e.target.value)})}/></label></div>
    <label>名称<input value={peer.name} onChange={e=>setPeer({...peer,name:e.target.value})}/></label><button disabled={busy}>信任此节点</button>
   </form><div className="communication-list">{Object.values(data?.config.peers??{}).map(v=><article key={v.nodeId}><strong>{v.name} · {v.host}:{v.port}</strong><small>{v.fingerprint}</small><button disabled={busy} onClick={()=>void act('untrust',{nodeId:v.nodeId},'已撤销对端信任。')}>撤销信任</button></article>)}</div>
  </section>
  <section><h4>应用接收与消息激活</h4><form onSubmit={e=>{e.preventDefault();const [appId,channel]=grant.route.split('|');void act('grant',{appId,channel,peers:grant.peers,activation:grant.activation});}}>
   <label>应用通道<select required value={grant.route} onChange={e=>{const route=e.target.value,saved=data?.config.grants[route];setGrant({route,peers:saved?.peers??[],activation:saved?.activation??false});}}><option value="">选择应用通道</option>{data?.routes.map(v=><option key={v.appId+'|'+v.channel} value={v.appId+'|'+v.channel}>{v.name} · {v.channel}{v.enabled?'':'（已停用）'}</option>)}</select></label>
   <fieldset><legend>允许来信的节点</legend>{Object.values(data?.config.peers??{}).map(v=><label className="communication-check" key={v.nodeId}><input type="checkbox" checked={grant.peers.includes(v.nodeId)} onChange={e=>setGrant({...grant,peers:e.target.checked?[...grant.peers,v.nodeId]:grant.peers.filter(p=>p!==v.nodeId)})}/>{v.name}</label>)}</fieldset>
   <label className="communication-check"><input type="checkbox" checked={grant.activation} onChange={e=>setGrant({...grant,activation:e.target.checked})}/>允许新消息激活未运行的应用</label><button disabled={busy||!grant.route}>保存接收授权</button>
  </form><p>消息只激活应用的接收入口。是否接受任务、调用 AI 或执行工具，由接收应用自己的规则决定。</p></section>
  <section><h4>后台运行与分发状态</h4><button disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))}>刷新状态</button>
   {Object.entries(data?.background.applications??{}).map(([appId,holds])=><article key={appId}><strong>{appId}</strong>{Object.entries(holds).map(([key,value])=><p key={key}>{key}：{value.reason}</p>)}</article>)}
   {data?.dispatchError&&<p role="alert">分发存储：{data.dispatchError.message}</p>}
   <div className="communication-list">{data?.deliveries.map(v=><article key={v.messageId}><strong>{names[v.delivery.state]??v.delivery.state} · {v.to.endpoint.id}</strong><small>{v.messageId}</small>{v.delivery.error&&<p>{v.delivery.error.message}</p>}{['suspended','parked'].includes(v.delivery.state)&&<button disabled={busy} onClick={()=>void act('retry',{messageId:v.messageId},'已重新安排本机分发。')}>重试应用分发</button>}</article>)}</div>
   <h4>最近发送</h4><div className="communication-list">{data?.operations.map(v=><article key={v.operationId}><strong>{names[v.status]??v.status}</strong><small>{v.operationId}</small>{v.error&&<p>{v.error.message}</p>}</article>)}</div><p>“对端已完整接收”代表内容已校验并保存。对方接受任务和提交结果是后续业务阶段。</p>
  </section>
 </div>;
}
