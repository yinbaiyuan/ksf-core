import {useState} from 'react';
import {Popover} from '@ksf/sdk/popover';
import {Button} from '@ksf/sdk/button';
import {TextField} from '@ksf/sdk/text-field';
import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PopoverBasicExample(){const [open,setOpen]=useState(false),[value,setValue]=useState('项目方案'),[result,setResult]=useState('尚未保存');return <div className='ksf-demo-stack'><Popover trigger="click" label='编辑资料名称' heading='资料名称' open={open} onOpenChange={setOpen} content={<div className='ksf-demo-stack'><TextField label='名称' value={value} onValueChange={setValue}/><Button size='small' onClick={()=>{setResult(`已保存：${value}`);setOpen(false);}}>保存名称</Button></div>}><Button>编辑资料</Button></Popover><output>{result}</output></div>;}
