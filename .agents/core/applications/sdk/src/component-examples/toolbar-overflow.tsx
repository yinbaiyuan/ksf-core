import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Toolbar} from '@ksf/sdk/toolbar';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ToolbarOverflowExample(){const [width,setWidth]=useState(380),[message,setMessage]=useState('');return <div className='ksf-demo-stack'><label>容器宽度 <input type='range' min='140' max='600' value={width} onChange={e=>setWidth(+e.target.value)}/></label><div style={{width,maxWidth:'100%'}}><Toolbar label='自适应工具栏' items={['新建','复制','保存','分享','归档','删除'].map((label,i)=>({id:label,label,priority:i===2?100:10-i,group:i<3?'edit':'other',onAction:()=>setMessage(label)}))}/></div><output>{message||'保存操作优先保留，其他操作收纳到更多。'}</output></div>;}
