import {useState} from 'react';
import {PullSwitch} from '@ksf/sdk/pull-switch';
export default function Example(){const [on,setOn]=useState(true);return <div style={{display:'grid',justifyItems:'center',gap:14,width:'100%',minWidth:0}}><PullSwitch label="Desk lamp" checked={on} onCheckedChange={setOn}/><output aria-live="polite">{on?'灯已开启':'灯已关闭'}；拖动拉绳或用 Tab 聚焦后按空格。不会操作真实设备。</output></div>;}
