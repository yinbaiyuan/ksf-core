import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DropdownMenu,type MenuItem} from '@ksf/sdk/dropdown-menu';
import {ButtonGroup} from '@ksf/sdk/button-group';
import {Popover} from '@ksf/sdk/popover';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function DropdownMenuExtraExample(){const [message,setMessage]=useState('');return <div className='ksf-demo-stack'><DropdownMenu label='资料操作' items={[{id:'new',label:'新建资料',icon:<FolderGlyph/>,extra:'⌘ N',onAction:()=>setMessage('新建')},{id:'search',label:'搜索资料',icon:<SearchGlyph/>,extra:<span style={{color:'var(--ksf-color-success)'}}>新功能</span>,onAction:()=>setMessage('搜索')},{id:'disabled',label:'等待开通',disabled:true,onAction:()=>{}}]}/><output>{message}</output></div>;}
