import {useState} from 'react';
import {Popconfirm} from '@ksf/sdk/popconfirm';
import {Button} from '@ksf/sdk/button';
import {TextField} from '@ksf/sdk/text-field';
import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PopconfirmStatesExample(){const [fail,setFail]=useState(true),[done,setDone]=useState(false);return <div className='ksf-demo-stack'><Popconfirm title='确认提交资料？' description={<Checkbox label='本次模拟失败' checked={fail} onCheckedChange={setFail}/>} onConfirm={async signal=>{await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new Error('取消'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},350);signal.addEventListener('abort',abort,{once:true});});if(fail)throw new Error('模拟失败');setDone(true);}}><Button>异步提交</Button></Popconfirm><output>{done?'提交成功':'等待确认'}</output></div>;}
