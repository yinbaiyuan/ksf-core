import {useState} from 'react';

import {MotionButton} from '@ksf/sdk/motion-button';
import {useEffect, useRef} from 'react';export default function Example(){const [status,setStatus]=useState('idle');const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);useEffect(()=>()=>clearTimeout(timer.current),[]);return <div style={{display:'grid',gap:12,justifyItems:'start'}}><MotionButton effect="gradient" loading={status==='working'} onClick={()=>{setStatus('working');timer.current=setTimeout(()=>setStatus('done'),1200);}}>{status==='done'?'✓ 已生成':'✦ 生成界面'}</MotionButton><output aria-live="polite">{status==='working'?'正在模拟生成…':status==='done'?'本地模拟已完成；模型调用由应用接入。':'按下开始'}</output></div>;}
