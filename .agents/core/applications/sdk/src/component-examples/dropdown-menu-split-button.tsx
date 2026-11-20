import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DropdownMenu,type MenuItem} from '@ksf/sdk/dropdown-menu';
import {ButtonGroup} from '@ksf/sdk/button-group';
import {Popover} from '@ksf/sdk/popover';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function DropdownMenuSplitButtonExample(){const [message,setMessage]=useState('');return <div className='ksf-demo-stack'><ButtonGroup attached label='提交操作'><Button variant='solid' tone='primary' onClick={()=>setMessage('提交当前资料')}>提交</Button><DropdownMenu label='其他提交方式' trigger='更多' items={[{id:'draft',label:'保存草稿',onAction:()=>setMessage('保存草稿')},{id:'review',label:'提交审核',onAction:()=>setMessage('提交审核')}]}/></ButtonGroup><output>{message}</output></div>;}
