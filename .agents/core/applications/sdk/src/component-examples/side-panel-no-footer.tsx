import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SidePanel} from '@ksf/sdk/side-panel';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SidePanelNoFooterExample(){const [open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>无页脚</Button><SidePanel open={open} onClose={()=>setOpen(false)} title='无页脚' footer={false}><p>只显示内容与关闭操作。</p></SidePanel></>;}
