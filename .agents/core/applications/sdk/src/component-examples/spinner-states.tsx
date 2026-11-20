import {useState,useRef,useEffect} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Spinner} from '@ksf/sdk/spinner';
export function SpinnerStatesExample(){const [busy,setBusy]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);useEffect(()=>()=>clearTimeout(timer.current),[]);return <div className='ksf-demo-stack'><Button disabled={busy} onClick={()=>{setBusy(true);timer.current=setTimeout(()=>setBusy(false),1800);}}>模拟加载</Button><Spinner spinning={busy} delay={200} block label='请稍候'><div style={{padding:20}}>延迟200ms显示，加载时暂停区域中的交互。<Button size='small'>区域操作</Button></div></Spinner></div>;}
