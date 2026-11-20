import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DropdownMenu,type MenuItem} from '@ksf/sdk/dropdown-menu';
import {ButtonGroup} from '@ksf/sdk/button-group';
import {Popover} from '@ksf/sdk/popover';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function DropdownMenuSelectionExample(){const [selected,setSelected]=useState<string[]>(['summary']);return <div className='ksf-demo-stack'><DropdownMenu label='显示内容' items={['summary','source','notes'].map((id,i)=>({id,label:['摘要','来源','笔记'][i],checked:selected.includes(id),keepOpen:true,onAction:()=>setSelected(old=>old.includes(id)?old.filter(value=>value!==id):[...old,id])}))}/><output>显示：{selected.join('、')||'无'}</output></div>;}
