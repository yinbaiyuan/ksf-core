import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SidePanel} from '@ksf/sdk/side-panel';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SidePanelPersistentExample(){const [open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>关闭时保留内容</Button><SidePanel open={open} onClose={()=>setOpen(false)} title='关闭时保留内容' keepMounted><TextField label='保留输入' description='关闭再打开后保留本组件内的输入。'/></SidePanel></>;}
