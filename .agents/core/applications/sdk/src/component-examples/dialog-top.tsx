import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Dialog} from '@ksf/sdk/dialog';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DialogTopExample(){const [open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>非居中弹窗</Button><Dialog open={open} onClose={()=>setOpen(false)} title='非居中弹窗' centered={false}><p>对话框靠窗口上方。</p></Dialog></>;}
