import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Switch} from '@ksf/sdk/switch';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SwitchLoadingExample(){const [checked,setChecked]=useState(false),[busy,setBusy]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);useEffect(()=>()=>clearTimeout(timer.current),[]);return <div className='ksf-demo-stack'><Switch label='异步设置' checked={checked} loading={busy} onCheckedChange={next=>{setBusy(true);timer.current=setTimeout(()=>{setChecked(next);setBusy(false);},1300);}}/><output>{busy?'正在保存':checked?'已启用':'已停用'}</output></div>;}
