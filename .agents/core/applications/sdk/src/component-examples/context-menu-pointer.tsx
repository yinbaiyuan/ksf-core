import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ContextMenu} from '@ksf/sdk/context-menu';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ContextMenuPointerExample(){const [message,setMessage]=useState('');return <div className='ksf-demo-stack'><ContextMenu label='右键测试区域' style={{height:170,border:'1px dashed var(--ksf-color-border-strong)',padding:20,borderRadius:8}} items={[{id:'new',label:'新建资料',icon:<FolderGlyph/>,onAction:()=>setMessage('新建资料')},{id:'search',label:'搜索资料',icon:<SearchGlyph/>,onAction:()=>setMessage('搜索资料')},{id:'sep',type:'separator' as const},{id:'remove',label:'移除资料',danger:true,onAction:()=>setMessage('移除资料')}]}>在区域任意位置右键，菜单会限制在当前窗口边界。</ContextMenu><output>{message}</output></div>;}
