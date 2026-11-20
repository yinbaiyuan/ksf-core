import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SidePanel} from '@ksf/sdk/side-panel';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SidePanelGuardExample(){const [open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>关闭条件与焦点返回</Button><SidePanel open={open} onClose={()=>setOpen(false)} title='关闭条件与焦点返回' closeOnEscape={false}><p>此例通过显式关闭按钮结束。</p></SidePanel></>;}
