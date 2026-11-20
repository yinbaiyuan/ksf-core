import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Menubar} from '@ksf/sdk/menubar';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function MenubarIconsExample(){const [message,setMessage]=useState('');return <div className='ksf-demo-stack'><Menubar label='资料应用菜单' menus={[{id:'file',label:'文件',items:[{id:'new',label:'新建资料',icon:<FolderGlyph/>,onAction:()=>setMessage('新建资料')},{id:'search',label:'搜索资料',icon:<SearchGlyph/>,onAction:()=>setMessage('搜索资料')},{id:'sep',type:'separator' as const},{id:'remove',label:'移除资料',danger:true,onAction:()=>setMessage('移除资料')}]},{id:'view',label:'查看',items:[{id:'summary',label:'摘要',icon:<SearchGlyph/>,onAction:()=>setMessage('摘要')}]}]}/><output>{message}</output></div>;}
