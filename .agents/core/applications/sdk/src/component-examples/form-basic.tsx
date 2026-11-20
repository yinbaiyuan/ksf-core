import {useState} from 'react';
import {Form,useForm} from '@ksf/sdk/form';
import {TextField} from '@ksf/sdk/text-field';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FormBasicExample(){const [result,setResult]=useState('尚未提交');const model=useForm({initialValues:{title:'项目资料',email:''},validate:values=>({title:values.title.trim()?'':'请填写项目名称'})});return <div className='ksf-demo-stack'><Form onCommit={async(_,ctx)=>{if(await model.validate(ctx.signal))setResult(`已保存：${model.values.title}`);}} onReset={()=>model.reset()}>{({submitting})=><><TextField label='项目名称' {...model.field('title')} required/><TextField label='联系邮箱' type='email' {...model.field('email')}/><div className='ksf-demo-row'><Button type='submit' variant='solid' tone='primary' loading={submitting}>保存项目</Button><Button type='reset'>还原</Button></div></>}</Form><output aria-live='polite'>{result}</output></div>;}
