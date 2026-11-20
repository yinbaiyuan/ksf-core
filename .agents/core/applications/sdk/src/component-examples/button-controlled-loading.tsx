import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ButtonControlledLoadingExample(){const [busy,setBusy]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);useEffect(()=>()=>clearTimeout(timer.current),[]);return <div className='ksf-demo-stack'><Button loading={busy} tone='primary' variant='solid' icon={<SearchGlyph/>} onClick={()=>{setBusy(true);timer.current=setTimeout(()=>setBusy(false),1600);}}>点击加载</Button><Button size='small' disabled={!busy} onClick={()=>{clearTimeout(timer.current);setBusy(false);}}>提前结束</Button><output>{busy?'正在处理，重复点击被阻止':'可开始任务'}</output></div>;}
