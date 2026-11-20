import {useState,useRef} from 'react';
import {Drawer} from '@ksf/sdk/drawer';
import {Button} from '@ksf/sdk/button';
import {TextField} from '@ksf/sdk/text-field';
import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DrawerStatesExample(){const [open,setOpen]=useState(false),[nested,setNested]=useState(false);return <div className='ksf-demo-stack'><Button onClick={()=>setOpen(true)}>打开嵌套抽屉</Button><Drawer open={open} title='项目资料' onClose={()=>setOpen(false)} size={440}><p>子层关闭后返回当前抽屉。</p><Button onClick={()=>setNested(true)}>查看子层</Button><Drawer open={nested} title='子层资料' size={320} onClose={()=>setNested(false)}><p>Escape只关闭最上层。</p></Drawer></Drawer></div>;}
