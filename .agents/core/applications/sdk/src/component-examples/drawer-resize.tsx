import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Drawer} from '@ksf/sdk/drawer';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DrawerResizeExample(){const [open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>拖动或键盘调整尺寸</Button><Drawer open={open} onClose={()=>setOpen(false)} title='拖动或键盘调整尺寸' resizable minSize={220} maxSize={800}><p>拖动内侧边界，或聚焦分隔条后按方向键调整。</p></Drawer></>;}
