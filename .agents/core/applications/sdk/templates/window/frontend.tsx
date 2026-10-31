import {useEffect,useState} from 'react';
import {mountReact,useApplicationSDK} from '@ksf/sdk/react';
import type {ApplicationSDK} from '@ksf/sdk';
import {Sheet} from '@ksf/sdk/components/ui/sheet';
import './style.css';
function App(){const sdk=useApplicationSDK(),[count,setCount]=useState(0),[error,setError]=useState(''),[detail,setDetail]=useState(false);
 useEffect(()=>{let live=true;void sdk.call<{count:number}>('read').then(value=>{if(live)setCount(value.count)}).catch(e=>setError(e.message));return()=>{live=false}},[sdk]);
 return <main className="example-app"><h1>我的工作应用</h1><p>已保存数值：{count}</p><button onClick={()=>void sdk.call<{count:number}>('increment').then(v=>setCount(v.count)).catch(e=>setError(e.message))}>增加并保存</button><button onClick={()=>setDetail(true)}>查看应用内详情</button>{error&&<p role="alert">{error}</p>}<Sheet open={detail} onOpenChange={setDetail} title="应用内详情"><p>此面板属于当前应用窗口；移动、缩放窗口时一起跟随。</p><button onClick={()=>setDetail(false)}>返回应用</button></Sheet></main>}
export function mount(container:HTMLElement,sdk:ApplicationSDK){return mountReact(App,container,sdk)}
