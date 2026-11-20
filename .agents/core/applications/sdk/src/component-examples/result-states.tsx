import {useState,useRef,useEffect} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Result} from '@ksf/sdk/result';
export function ResultStatesExample(){const [status,setStatus]=useState<'error'|'403'|'404'|'500'>('error'),[retry,setRetry]=useState(0);return <div className='ksf-demo-stack'><div className='ksf-demo-row'>{(['error','403','404','500'] as const).map(s=><Button size='small' key={s} onClick={()=>setStatus(s)}>{s}</Button>)}</div><Result status={status} heading={status==='error'?'提交失败':status==='403'?'无权访问':status==='404'?'内容不存在':'服务暂不可用'} description={`已重试 ${retry} 次`} actions={<Button onClick={()=>setRetry(v=>v+1)}>重试</Button>}>{status==='error'&&'请检查必填字段并重新提交。'}</Result></div>;}
