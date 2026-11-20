import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {HoldButton} from '@ksf/sdk/motion-button';
export default function Example(){const [done,setDone]=useState(false);return <div style={{display:'grid',gap:18,justifyItems:'start'}}><HoldButton onConfirm={()=>setDone(true)} disabled={done}>确认归档</HoldButton><output aria-live="polite">{done?'已确认，可重置再试':'按住鼠标或Space/Enter；提前松开、离开或Escape取消。'}</output><Button onClick={()=>setDone(false)}>重置</Button><HoldButton disabled onConfirm={()=>{}}>不可操作</HoldButton></div>;}
