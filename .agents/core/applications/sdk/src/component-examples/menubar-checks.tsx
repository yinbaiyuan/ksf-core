import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Menubar} from '@ksf/sdk/menubar';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function MenubarChecksExample(){const [summary,setSummary]=useState(true);return <div className='ksf-demo-stack'><Menubar label='显示菜单' menus={[{id:'view',label:'显示',items:[{id:'summary',label:'显示摘要',checked:summary,keepOpen:true,onAction:()=>setSummary(v=>!v)},{id:'separator',type:'separator'},{id:'disabled',label:'不可用内容',disabled:true,onAction:()=>{}}]}]}/><output>摘要：{summary?'显示':'隐藏'}</output></div>;}
