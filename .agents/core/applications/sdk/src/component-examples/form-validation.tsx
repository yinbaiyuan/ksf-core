import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Form,useForm} from '@ksf/sdk/form';import {TextField} from '@ksf/sdk/text-field';import {NumberField} from '@ksf/sdk/number-field';import {Checkbox} from '@ksf/sdk/checkbox';import {Select} from '@ksf/sdk/select';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FormValidationExample(){const form=useForm({initialValues:{name:'',age:18},validate:v=>({name:v.name.trim()?'':'请输入姓名',age:v.age>=18?'':'需满18岁'})}),[result,setResult]=useState('');return <Form onCommit={async(_,ctx)=>{if(await form.validate(ctx.signal))setResult('校验通过：'+form.values.name);}} onReset={form.reset}><TextField label='姓名' {...form.field('name')}/><NumberField label='年龄' value={form.values.age} error={form.errors.age} onValueChange={v=>form.setField('age',v??0)}/><Button type='submit'>验证</Button><Button type='reset'>重置</Button><output>{result}</output></Form>;}
