import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DropdownMenu,type MenuItem} from '@ksf/sdk/dropdown-menu';
import {ButtonGroup} from '@ksf/sdk/button-group';
import {Popover} from '@ksf/sdk/popover';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function DropdownMenuCustomPanelExample(){const [open,setOpen]=useState(false),[value,setValue]=useState(''),[message,setMessage]=useState('');return <div className='ksf-demo-stack'><Popover trigger="click" open={open} onOpenChange={setOpen} label='扩展资料操作' heading='资料操作' content={<div className='ksf-demo-stack'><TextField label='查找操作' value={value} onValueChange={setValue}/>{['打开资料','保存草稿','移除资料'].filter(label=>label.includes(value)).map(label=><Button key={label} variant='text' onClick={()=>{setMessage(label);setOpen(false);}}>{label}</Button>)}<Button size='small' onClick={()=>setOpen(false)}>关闭面板</Button></div>}><Button>扩展操作</Button></Popover><output>{message}</output></div>;}
