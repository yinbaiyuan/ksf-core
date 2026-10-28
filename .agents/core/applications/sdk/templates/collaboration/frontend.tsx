import {useEffect,useState} from 'react';
import {mountReact,useApplicationSDK} from '@ksf/sdk/react';
import {randomId} from '@ksf/sdk/random-id';
import './style.css';
function App(){const sdk=useApplicationSDK(),[state,setState]=useState<any>(null),[error,setError]=useState(''),[title,setTitle]=useState(''),[text,setText]=useState(''),[node,setNode]=useState('');
 const load=()=>sdk.call('inspect').then(setState).catch(e=>setError(e.message));useEffect(()=>{void load();},[]);
 async function act(method:string,params:unknown){try{await sdk.call(method,{...(params as object),operationId:randomId()});setError('');await load();}catch(e){setError((e as Error).message);}}
 return <div className="team-example"><h2>团队协作示例</h2><p>任务会在本应用中保存；来信可激活应用。接受、反馈和审批由你决定。</p>{error&&<p role="alert">{error}</p>}<button onClick={()=>void load()}>刷新反馈</button>
 <form onSubmit={e=>{e.preventDefault();void act('task.create',{title});}}><label>目标任务<input required value={title} onChange={e=>setTitle(e.target.value)}/></label><button>创建任务</button></form>
 <label>目标节点 ID<input value={node} onChange={e=>setNode(e.target.value)}/></label><label>传递内容 / 反馈<textarea value={text} onChange={e=>setText(e.target.value)}/></label>
 {Object.values(state?.tasks??{}).map((task:any)=><section key={task.taskId}><h3>{task.title}</h3><p>{task.taskId} · {task.status}</p><button disabled={!node} onClick={()=>void act('task.send',{taskId:task.taskId,requestId:randomId(),to:{nodeId:node,endpoint:{kind:'app',id:sdk.appId}},text})}>发起新一轮协作</button>
 {task.rounds.map((id:string)=>{const round=state.requests[id];return <article key={id}><p>{id} · {round.status}</p><p>{round.text??round.feedback?.text}</p>{round.status==='received'&&<button onClick={()=>void act('task.accept',{requestId:id})}>接受此任务</button>}{['received','accepted'].includes(round.status)&&<button onClick={()=>void act('task.feedback',{requestId:id,text})}>提交反馈</button>}{round.status==='review'&&<button onClick={()=>void act('task.approve',{requestId:id})}>批准并继续</button>}</article>;})}</section>)}</div>;
}
export function mount(container:HTMLElement,sdk:any){return mountReact(App,container,sdk);}
