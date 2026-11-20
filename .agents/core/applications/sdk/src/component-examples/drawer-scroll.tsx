import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Drawer} from '@ksf/sdk/drawer';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DrawerScrollExample(){const [open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>长内容与滚动</Button><Drawer open={open} onClose={()=>setOpen(false)} title='长内容与滚动' ><div>{Array.from({length:25},(_,i)=><p key={i}>第 {i+1} 段资料说明。</p>)}</div></Drawer></>;}
