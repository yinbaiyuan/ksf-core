import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Drawer} from '@ksf/sdk/drawer';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DrawerCustomFooterExample(){const [open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>自定义页脚</Button><Drawer open={open} onClose={()=>setOpen(false)} title='自定义页脚' footer={<><Button onClick={()=>setOpen(false)}>稍后</Button><Button variant='solid' tone='primary' onClick={()=>setOpen(false)}>保存</Button></>}><p>页脚由应用组织。</p></Drawer></>;}
