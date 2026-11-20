import {useState} from 'react';
import {SignaturePad, type SignatureStroke} from '@ksf/sdk/signature-pad';
export default function Example(){const [strokes,setStrokes]=useState<readonly SignatureStroke[]>([]),[bytes,setBytes]=useState(0);return <div style={{width:'100%',minWidth:0,display:'grid',justifyItems:'center',gap:12}}><SignaturePad label="Signature" value={strokes} onValueChange={setStrokes} onSvgChange={svg=>setBytes(svg?.length??0)}/><output aria-live="polite">{strokes.length} 笔 · SVG {bytes} 字符；仅保留在当前演示窗口。Escape 取消当前笔画。</output></div>;}
