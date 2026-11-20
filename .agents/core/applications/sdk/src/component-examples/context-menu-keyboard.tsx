import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ContextMenu} from '@ksf/sdk/context-menu';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ContextMenuKeyboardExample(){const [message,setMessage]=useState('');return <div className='ksf-demo-stack'><ContextMenu label='键盘菜单区域' style={{padding:24,border:'1px solid var(--ksf-color-border)'}} items={[{id:'branch',label:'子菜单',items:[{id:'one',label:'执行子项',onAction:()=>setMessage('已执行子项')}]}]}>Tab聚焦后按Shift＋F10，方向键进入子菜单，Escape逐层返回。</ContextMenu><output>{message}</output></div>;}
