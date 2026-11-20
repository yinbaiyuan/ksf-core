import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Drawer} from '@ksf/sdk/drawer';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DrawerFormExample(){const [open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>弹层内表单</Button><Drawer open={open} onClose={()=>setOpen(false)} title='弹层内表单' ><TextField label='名称' autoFocus/><TextField label='说明'/></Drawer></>;}
