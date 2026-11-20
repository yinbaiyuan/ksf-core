import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Toolbar} from '@ksf/sdk/toolbar';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ToolbarGroupsExample(){const [message,setMessage]=useState('');return <div className='ksf-demo-stack'><Toolbar label='编辑工具栏' items={[{id:'new',label:'新建',icon:FolderGlyph,group:'file',onAction:()=>setMessage('新建')},{id:'search',label:'搜索',icon:SearchGlyph,group:'file',onAction:()=>setMessage('搜索')},{id:'confirm',label:'确认',icon:CheckGlyph,group:'task',onAction:()=>setMessage('确认')},{id:'disabled',label:'不可用',group:'task',disabled:true,onAction:()=>{}}]}/><output>{message}</output></div>;}
