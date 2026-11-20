import {useState,useRef} from 'react';
import {Dialog} from '@ksf/sdk/dialog';
import {Button} from '@ksf/sdk/button';
import {TextField} from '@ksf/sdk/text-field';
import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DialogStatesExample(){const [open,setOpen]=useState(false),[fail,setFail]=useState(true);return <div className='ksf-demo-stack'><Button onClick={()=>setOpen(true)}>异步确认与失败重试</Button><Dialog open={open} title='提交资料' confirmLabel='提交' onClose={()=>setOpen(false)} onConfirm={async signal=>{await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new Error('取消'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},350);signal.addEventListener('abort',abort,{once:true});});if(fail)throw new Error('模拟失败');}}><p>失败保留当前内容；取消或关闭会终止本次信号。</p><Checkbox label='本次模拟失败' checked={fail} onCheckedChange={setFail}/></Dialog></div>;}
