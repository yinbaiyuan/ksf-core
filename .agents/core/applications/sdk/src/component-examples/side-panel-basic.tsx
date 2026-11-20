import {useState,useRef} from 'react';
import {SidePanel} from '@ksf/sdk/side-panel';
import {Button} from '@ksf/sdk/button';
import {TextField} from '@ksf/sdk/text-field';
import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SidePanelBasicExample(){const [open,setOpen]=useState(false),[count,setCount]=useState(0);return <div className='ksf-demo-stack'><Button onClick={()=>setOpen(true)}>打开检查面板</Button><Button onClick={()=>setCount(v=>v+1)}>主内容仍可操作 {count}</Button><SidePanel open={open} title='资料属性' size={320} onClose={()=>setOpen(false)}><TextField label='资料名称' defaultValue='空间方案'/><p>无背景遮罩，不阻止主内容操作。</p></SidePanel></div>;}
