import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Statistic} from '@ksf/sdk/statistic';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function StatisticCountdownExample(){const [remaining,setRemaining]=useState(60),[running,setRunning]=useState(false);useEffect(()=>{if(!running)return;const timer=setInterval(()=>setRemaining(v=>Math.max(0,v-1)),1000);return()=>clearInterval(timer);},[running]);return <div className='ksf-demo-stack'><Statistic title='评审倒计时' value={remaining} suffix='秒'/><Button onClick={()=>setRunning(v=>!v)}>{running?'暂停':'开始'}</Button><Button onClick={()=>{setRemaining(60);setRunning(false);}}>重置</Button></div>;}
