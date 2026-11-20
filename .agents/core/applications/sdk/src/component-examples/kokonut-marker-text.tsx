import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {AnimatedText} from '@ksf/sdk/animated-text';

export default function Example(){const [paused,setPaused]=useState(false),[run,setRun]=useState(0);return <div style={{display:'grid',gap:25,width:'100%',padding:'16px 6px'}}><AnimatedText key={run} text="先把重点标出来" words={[]} effect="marker" paused={paused}/><div style={{display:'flex',gap:10,flexWrap:'wrap'}}><Button aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?'继续动效':'暂停动效'}</Button><Button onClick={()=>setRun(n=>n+1)}>重新演示</Button></div><small>动态只在当前可见且启用的窗口运行。</small></div>;}
