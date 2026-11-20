import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Dialog} from '@ksf/sdk/dialog';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DialogWidthExample(){const [open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>自定义宽度</Button><Dialog open={open} onClose={()=>setOpen(false)} title='自定义宽度' width={720}><p>适合较宽的资料详情。</p></Dialog></>;}
