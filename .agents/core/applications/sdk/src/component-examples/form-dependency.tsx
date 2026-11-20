import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Form,useForm} from '@ksf/sdk/form';import {TextField} from '@ksf/sdk/text-field';import {NumberField} from '@ksf/sdk/number-field';import {Checkbox} from '@ksf/sdk/checkbox';import {Select} from '@ksf/sdk/select';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FormDependencyExample(){const [kind,setKind]=useState('personal');return <Form onCommit={()=>{}}><Select label='主体类型' value={kind} onValueChange={setKind} options={[{value:'personal',label:'个人'},{value:'company',label:'公司'}]}/>{kind==='company'?<TextField label='公司名称' name='company' required/>:<TextField label='姓名' name='person' required/>}<Button type='submit'>提交</Button></Form>;}
