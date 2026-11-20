import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DropdownMenu,type MenuItem} from '@ksf/sdk/dropdown-menu';
import {ButtonGroup} from '@ksf/sdk/button-group';
import {Popover} from '@ksf/sdk/popover';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function DropdownMenuNestedExample(){const [message,setMessage]=useState('');return <div className='ksf-demo-stack'><DropdownMenu label='导出资料' items={[{id:'text',label:'文本格式',items:[{id:'md',label:'Markdown',onAction:()=>setMessage('Markdown')},{id:'plain',label:'纯文本',onAction:()=>setMessage('纯文本')}]},{id:'more',label:'更多格式',items:[{id:'other',label:'其他',items:[{id:'json',label:'JSON',onAction:()=>setMessage('JSON')}]}]}]}/><output>{message}</output></div>;}
