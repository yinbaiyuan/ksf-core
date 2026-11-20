import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {BackgroundEffect} from '@ksf/sdk/background-effect';
export default function Example(){const [paused,setPaused]=useState(false),[run,setRun]=useState(0),[action,setAction]=useState('');return <div style={{display:'grid',gap:14,width:'100%'}}><BackgroundEffect key={run} label="线带流动与避让" mode="paths" paused={paused} onAction={name=>setAction('本地演示操作：'+name)}/><div style={{display:'flex',gap:12}}><Button aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?'继续背景':'暂停背景'}</Button><Button onClick={()=>setRun(n=>n+1)}>重新生成</Button></div><output aria-live="polite">{action}</output></div>}
