import {useState} from 'react';
import {WheelPickerGroup} from '@ksf/sdk/wheel-picker';
export default function Example(){const [value,setValue]=useState<Record<string,string>>({hour:'8',minute:'41',period:'am'});return <div style={{display:'grid',justifyItems:'center',gap:18,width:'100%',minWidth:0}}><WheelPickerGroup label="Time" value={value} onValueChange={setValue} name="time"/><output aria-live="polite">{Number(value.hour)+1}:{value.minute.padStart(2,'0')} {value.period.toUpperCase()}；拖动、轻甩、滚轮或方向键选取。</output></div>;}
