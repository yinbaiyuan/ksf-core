import {useState} from 'react';
import {Dial} from '@ksf/sdk/dial';
export default function Example(){const [value,setValue]=useState(21);return <div style={{display:'grid',justifyItems:'center',gap:20,width:'100%',minWidth:0}}><Dial label="Temperature" min={16} max={30} step={.5} value={value} onValueChange={setValue} unit="°"/><output aria-live="polite">{value.toFixed(1)}°；圆周拖动、轻甩、滚轮或方向键，双击回到21°。</output></div>;}
