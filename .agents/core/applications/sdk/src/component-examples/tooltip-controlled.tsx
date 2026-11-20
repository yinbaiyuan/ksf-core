import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tooltip} from '@ksf/sdk/tooltip';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TooltipControlledExample(){const [open,setOpen]=useState(false);return <div className='ksf-demo-row'><Button onClick={()=>setOpen(v=>!v)}>切换提示</Button><Tooltip content='受控提示' open={open} onOpenChange={setOpen}><Button>目标</Button></Tooltip><Tooltip disabled content='禁用时不显示'><Button>禁用提示</Button></Tooltip></div>;}
