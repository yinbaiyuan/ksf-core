import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Popover} from '@ksf/sdk/popover';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PopoverControlledExample(){const [open,setOpen]=useState(false);return <Popover trigger="click" label='受控详情' open={open} onOpenChange={setOpen} heading='资料详情' content={<div className='ksf-demo-stack'><p>当前资料已就绪。</p><Button onClick={()=>setOpen(false)}>关闭详情</Button></div>}><Button>查看详情</Button></Popover>;}
