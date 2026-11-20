import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Drawer} from '@ksf/sdk/drawer';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DrawerAsyncExample(){const [open,setOpen]=useState(false),[fail,setFail]=useState(true);return <><Button onClick={()=>setOpen(true)}>异步提交</Button><Drawer title='异步提交' open={open} onClose={()=>setOpen(false)} footer={undefined} onConfirm={async signal=>{await new Promise(resolve=>setTimeout(resolve,500));if(signal.aborted)return;if(fail){setFail(false);throw new Error('演示失败');}}}><p>首次模拟失败，再次确认成功。</p></Drawer></>;}
