import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Drawer} from '@ksf/sdk/drawer';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DrawerLargeExample(){const [open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>自定义面板尺寸</Button><Drawer open={open} onClose={()=>setOpen(false)} title='自定义面板尺寸' size='65%'><p>按照当前窗口比例展开。</p></Drawer></>;}
