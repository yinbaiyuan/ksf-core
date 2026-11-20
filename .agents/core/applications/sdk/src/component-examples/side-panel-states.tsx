import {useState,useRef} from 'react';
import {SidePanel} from '@ksf/sdk/side-panel';
import {Button} from '@ksf/sdk/button';
import {TextField} from '@ksf/sdk/text-field';
import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SidePanelStatesExample(){const [open,setOpen]=useState(false);return <div className='ksf-demo-stack'><Button onClick={()=>setOpen(true)}>从左侧检查</Button><SidePanel open={open} title='筛选条件' side='start' onClose={()=>setOpen(false)} footer={<Button onClick={()=>setOpen(false)}>应用条件</Button>}><TextField label='关键词' placeholder='输入后应用'/></SidePanel></div>;}
