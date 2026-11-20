import {useState} from 'react';

import {MotionButton} from '@ksf/sdk/motion-button';
export default function Example() { const [count,setCount]=useState(0);return <div style={{display:'grid',gap:18,justifyItems:'start'}}><MotionButton effect="slide" alternateLabel="开始探索 →" onClick={()=>setCount(count+1)}>探索组件</MotionButton><output aria-live="polite">已点击 {count} 次</output><MotionButton effect="slide" disabled>禁用</MotionButton><MotionButton effect="slide" loading>处理中</MotionButton></div>;}
