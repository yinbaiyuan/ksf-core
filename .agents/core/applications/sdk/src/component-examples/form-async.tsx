import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Form,useForm} from '@ksf/sdk/form';import {TextField} from '@ksf/sdk/text-field';import {NumberField} from '@ksf/sdk/number-field';import {Checkbox} from '@ksf/sdk/checkbox';import {Select} from '@ksf/sdk/select';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FormAsyncExample(){const form=useForm({initialValues:{name:''},validate:async(v,signal)=>{await new Promise(resolve=>setTimeout(resolve,500));if(signal.aborted)return {};return {name:v.name==='taken'?'该名称已存在':''};}});return <Form onCommit={(_,ctx)=>form.validate(ctx.signal).then(()=>{})} onReset={form.reset}><TextField label='名称' description='输入 taken 查看异步错误；修改值会取消旧校验。' {...form.field('name')}/><Button type='submit' loading={form.validating}>检查名称</Button><Button type='reset'>取消并重置</Button></Form>;}
