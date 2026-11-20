import {useState} from 'react';
import {Form,useForm} from '@ksf/sdk/form';
import {TextField} from '@ksf/sdk/text-field';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FormStatesExample(){const [fail,setFail]=useState(true),[result,setResult]=useState('可模拟失败后重试');return <div className='ksf-demo-stack'><label><input type='checkbox' checked={fail} onChange={e=>setFail(e.target.checked)}/> 本次模拟失败</label><Form onCommit={async(data,{signal})=>{await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new Error('取消'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},350);signal.addEventListener('abort',abort,{once:true});});if(fail)throw new Error('模拟失败');setResult(`已提交：${data.get('summary')}`);}}>{({submitting})=><><TextField label='摘要' name='summary' defaultValue='交付资料' required/><Button type='submit' loading={submitting} variant='solid' tone='primary'>提交资料</Button></>}</Form><output aria-live='polite'>{result}</output></div>;}
