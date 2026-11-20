import {useState} from 'react';
import {AvatarPicker, type AvatarValue} from '@ksf/sdk/avatar-picker';
export default function Example(){const [value,setValue]=useState<AvatarValue>({displayName:'Robin Vale',variant:0}),[confirmed,setConfirmed]=useState('');return <div style={{width:'100%',minWidth:0,display:'grid',justifyItems:'center',gap:12}}><AvatarPicker label="Pick your avatar" value={value} onValueChange={setValue} onConfirm={v=>setConfirmed(v.seed)}/><output aria-live="polite">{confirmed?'已确认 '+confirmed:'拖动人像旋转，随机生成或选择下方变体。'}；不上传照片。</output></div>;}
