import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SearchField} from '@ksf/sdk/search-field';import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SearchFieldAsyncExample(){const [busy,setBusy]=useState(false),[result,setResult]=useState(''),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);useEffect(()=>()=>clearTimeout(timer.current),[]);return <div className='ksf-demo-stack'><SearchField label='异步搜索' loading={busy} searchAction='查找' onSearch={value=>{setBusy(true);timer.current=setTimeout(()=>{setResult(value||'全部资料');setBusy(false);},1200);}}/><output>{busy?'正在检索':result}</output></div>;}
