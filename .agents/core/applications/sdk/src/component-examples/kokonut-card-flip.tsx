import {useState} from 'react';
import {FlipCard} from '@ksf/sdk/flip-card';
export default function Example(){const [flipped,setFlipped]=useState(false);return <div style={{display:'grid',justifyItems:'center',gap:30,width:'100%'}}><FlipCard label="Event ticket" flipped={flipped} onFlippedChange={setFlipped}/><output aria-live="polite">{flipped?'背面 · 入场码':'正面 · 活动票面'}；点击、拖动轻甩或按 Enter 翻面。</output></div>;}
