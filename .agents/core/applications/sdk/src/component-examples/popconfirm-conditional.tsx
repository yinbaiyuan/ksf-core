import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Popconfirm} from '@ksf/sdk/popconfirm';import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PopconfirmConditionalExample(){const [need,setNeed]=useState(true),[open,setOpen]=useState(false),[count,setCount]=useState(0);return <div className='ksf-demo-row'><Checkbox label='需要确认' checked={need} onCheckedChange={setNeed}/><Popconfirm title='确认本次操作？' open={open} onOpenChange={next=>{if(next&&!need)setCount(c=>c+1);else setOpen(next);}} onConfirm={()=>{setCount(c=>c+1);}}><Button>操作</Button></Popconfirm><output>{count}</output></div>;}
