import {useState,type SVGProps} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {DropdownMenu} from '@ksf/sdk/dropdown-menu';
export function DropdownMenuStatesExample(){const [disabled,setDisabled]=useState(false),[result,setResult]=useState('尚未选择');return <div className='ksf-demo-stack'><div className='ksf-demo-row'><Button size='small' onClick={()=>setDisabled(v=>!v)}>{disabled?'启用菜单':'禁用菜单'}</Button><DropdownMenu label='更多操作' disabled={disabled} trigger='更多' items={[{id:'first',label:'常规操作',onAction:()=>setResult('已执行常规操作')},{id:'group',label:'子菜单',items:[{id:'child',label:'子项操作',onAction:()=>setResult('已执行子项操作')}]},{id:'danger',label:'危险操作',danger:true,onAction:()=>setResult('已执行演示危险操作')}]}/></div><p>方向键、Home/End、Escape与Tab可操作；快捷键文字不注册全局命令。</p><output role='status'>{result}</output></div>;}
