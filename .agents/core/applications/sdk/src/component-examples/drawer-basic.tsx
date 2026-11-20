import {useState,useRef} from 'react';
import {Drawer} from '@ksf/sdk/drawer';
import {Button} from '@ksf/sdk/button';
import {TextField} from '@ksf/sdk/text-field';
import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DrawerBasicExample(){const [side,setSide]=useState<'start'|'end'|'top'|'bottom'>('end'),[open,setOpen]=useState(false);return <div className='ksf-demo-stack'><div className='ksf-demo-row'>{(['start','end','top','bottom'] as const).map(value=><Button key={value} onClick={()=>{setSide(value);setOpen(true);}}>{({start:'左侧',end:'右侧',top:'顶部',bottom:'底部'})[value]}</Button>)}</div><Drawer title='资料详情' open={open} side={side} onClose={()=>setOpen(false)} keepMounted><TextField label='备注' defaultValue='关闭重开后保留草稿'/><p>抽屉以当前窗口为范围，宿主窗口按钮与其他窗口仍可用。</p></Drawer></div>;}
