import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Menubar} from '@ksf/sdk/menubar';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function MenubarNestedExample(){const [message,setMessage]=useState('');return <div className='ksf-demo-stack'><Menubar label='多级工作菜单' menus={[{id:'file',label:'文件',items:[{id:'export',label:'导出',items:[{id:'format',label:'文本格式',items:[{id:'md',label:'Markdown',onAction:()=>setMessage('Markdown')}]}]}]},{id:'view',label:'查看',items:[{id:'overview',label:'概览',onAction:()=>setMessage('概览')}]}]}/><output>{message}</output><p>左右键切换根菜单，右键进入子菜单，Escape逐层返回。</p></div>;}
