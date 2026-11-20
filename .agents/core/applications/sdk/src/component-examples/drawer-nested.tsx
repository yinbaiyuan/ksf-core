import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Drawer} from '@ksf/sdk/drawer';import {TextField} from '@ksf/sdk/text-field';import {Dialog} from '@ksf/sdk/dialog';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DrawerNestedExample(){const [open,setOpen]=useState(false),[inner,setInner]=useState(false);return <><Button onClick={()=>setOpen(true)}>打开外层</Button><Drawer title='外层资料' open={open} onClose={()=>setOpen(false)}><Button onClick={()=>setInner(true)}>查看子项</Button><Dialog title='子项详情' open={inner} onClose={()=>setInner(false)}>子层关闭后焦点回到触发按钮。</Dialog></Drawer></>;}
