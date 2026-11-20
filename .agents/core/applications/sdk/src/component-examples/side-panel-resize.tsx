import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SidePanel} from '@ksf/sdk/side-panel';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SidePanelResizeExample(){const [open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>拖动或键盘调整尺寸</Button><SidePanel open={open} onClose={()=>setOpen(false)} title='拖动或键盘调整尺寸' resizable minSize={220} maxSize={800}><p>拖动内侧边界，或聚焦分隔条后按方向键调整。</p></SidePanel></>;}
