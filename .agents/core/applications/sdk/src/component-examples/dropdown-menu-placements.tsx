import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DropdownMenu,type MenuItem} from '@ksf/sdk/dropdown-menu';
import {ButtonGroup} from '@ksf/sdk/button-group';
import {Popover} from '@ksf/sdk/popover';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function DropdownMenuPlacementsExample(){const [message,setMessage]=useState('');return <div className='ksf-demo-stack'><div className='ksf-demo-row'>{(['top-start','top','top-end','bottom-start','bottom','bottom-end'] as const).map(placement=><DropdownMenu key={placement} label={placement} placement={placement} items={[{id:'new',label:'新建资料',icon:<FolderGlyph/>,onAction:()=>setMessage('新建资料')},{id:'search',label:'搜索资料',icon:<SearchGlyph/>,onAction:()=>setMessage('搜索资料')},{id:'sep',type:'separator' as const},{id:'remove',label:'移除资料',danger:true,onAction:()=>setMessage('移除资料')}]}/>)}</div><output>{message}</output></div>;}
