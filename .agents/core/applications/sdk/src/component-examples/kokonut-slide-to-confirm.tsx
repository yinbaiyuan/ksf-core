import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {SlideToConfirm} from '@ksf/sdk/motion-button';
export default function Example(){const [done,setDone]=useState(false);return <div style={{display:'grid',gap:18}}><SlideToConfirm label="滑动提交" confirmed={done} onConfirm={()=>setDone(true)}/><output aria-live="polite">{done?'提交已确认':'未到右侧就松开会复位；支持End、Enter确认。'}</output><Button onClick={()=>setDone(false)}>重置</Button><SlideToConfirm label="暂不可提交" disabled onConfirm={()=>{}}/></div>;}
