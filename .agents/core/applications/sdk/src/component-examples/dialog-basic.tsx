import {useState,useRef} from 'react';
import {Dialog} from '@ksf/sdk/dialog';
import {Button} from '@ksf/sdk/button';
import {TextField} from '@ksf/sdk/text-field';
import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DialogBasicExample(){const [open,setOpen]=useState(false),[title,setTitle]=useState('项目方案'),[result,setResult]=useState('尚未操作');const focus=useRef<HTMLInputElement>(null);return <div className='ksf-demo-stack'><Button variant='solid' tone='primary' onClick={()=>setOpen(true)}>打开对话框</Button><output>{result}</output><Dialog open={open} title='编辑项目名称' description='此对话框只限制当前应用窗口。' initialFocus={focus} keepMounted onClose={reason=>{setResult(`关闭原因：${reason}`);setOpen(false);}} onConfirm={()=>setResult(`已保存：${title}`)}><TextField ref={focus} label='项目名称' value={title} onValueChange={setTitle}/></Dialog></div>;}
