import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Form,useForm} from '@ksf/sdk/form';import {TextField} from '@ksf/sdk/text-field';import {NumberField} from '@ksf/sdk/number-field';import {Checkbox} from '@ksf/sdk/checkbox';import {Select} from '@ksf/sdk/select';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FormControlsExample(){const [result,setResult]=useState('');return <Form onCommit={data=>setResult(JSON.stringify([...data]))}><TextField label='名称' name='name'/><Select label='角色' name='role' options={[{value:'editor',label:'编辑'},{value:'viewer',label:'查看'}]}/><Checkbox label='接受协议' name='agree'/><Button type='submit'>读取 FormData</Button><output>{result}</output></Form>;}
