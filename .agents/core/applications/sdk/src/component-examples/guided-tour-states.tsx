import {useState,useRef} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {GuidedTour} from '@ksf/sdk/guided-tour';
export function GuidedTourStatesExample(){const [open,setOpen]=useState(false),[count,setCount]=useState(0),target=useRef<HTMLButtonElement>(null);return <div className='ksf-demo-stack'><div className='ksf-demo-row'><Button ref={target} onClick={()=>setCount(v=>v+1)}>区域操作 {count}</Button><Button onClick={()=>setOpen(true)}>非模态引导</Button></div><GuidedTour open={open} modal={false} onClose={()=>setOpen(false)} steps={[{id:'operate',heading:'可继续操作区域',description:'非模态说明不会阻止此窗口的其他操作。',target},{id:'summary',heading:'说明结束',description:'没有目标的步骤在当前窗口居中显示。'}]}/></div>;}
