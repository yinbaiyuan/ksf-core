import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SidePanel} from '@ksf/sdk/side-panel';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SidePanelFormExample(){const [open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>弹层内表单</Button><SidePanel open={open} onClose={()=>setOpen(false)} title='弹层内表单' ><TextField label='名称' autoFocus/><TextField label='说明'/></SidePanel></>;}
