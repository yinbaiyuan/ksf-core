import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Drawer} from '@ksf/sdk/drawer';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DrawerSidesExample(){const [side,setSide]=useState<'start'|'end'|'top'|'bottom'>('end'),[open,setOpen]=useState(false);return <div className='ksf-demo-row'>{(['start','end','top','bottom'] as const).map(s=><Button key={s} onClick={()=>{setSide(s);setOpen(true);}}>{s}</Button>)}<Drawer title='方向展示' open={open} onClose={()=>setOpen(false)} side={side} size={280}>沿当前窗口边缘展开。</Drawer></div>;}
