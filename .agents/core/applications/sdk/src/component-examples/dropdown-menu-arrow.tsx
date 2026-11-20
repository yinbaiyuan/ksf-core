import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DropdownMenu,type MenuItem} from '@ksf/sdk/dropdown-menu';
import {ButtonGroup} from '@ksf/sdk/button-group';
import {Popover} from '@ksf/sdk/popover';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function DropdownMenuArrowExample(){const [message,setMessage]=useState('');return <div className='ksf-demo-stack'><div className='ksf-demo-row'><DropdownMenu label='下方箭头' placement='bottom' arrow items={[{id:'new',label:'新建资料',icon:<FolderGlyph/>,onAction:()=>setMessage('新建资料')},{id:'search',label:'搜索资料',icon:<SearchGlyph/>,onAction:()=>setMessage('搜索资料')},{id:'sep',type:'separator' as const},{id:'remove',label:'移除资料',danger:true,onAction:()=>setMessage('移除资料')}]}/><DropdownMenu label='上方箭头' placement='top' arrow items={[{id:'new',label:'新建资料',icon:<FolderGlyph/>,onAction:()=>setMessage('新建资料')},{id:'search',label:'搜索资料',icon:<SearchGlyph/>,onAction:()=>setMessage('搜索资料')},{id:'sep',type:'separator' as const},{id:'remove',label:'移除资料',danger:true,onAction:()=>setMessage('移除资料')}]}/><DropdownMenu label='右侧箭头' placement='right' arrow items={[{id:'new',label:'新建资料',icon:<FolderGlyph/>,onAction:()=>setMessage('新建资料')},{id:'search',label:'搜索资料',icon:<SearchGlyph/>,onAction:()=>setMessage('搜索资料')},{id:'sep',type:'separator' as const},{id:'remove',label:'移除资料',danger:true,onAction:()=>setMessage('移除资料')}]}/></div><output>{message}</output></div>;}
