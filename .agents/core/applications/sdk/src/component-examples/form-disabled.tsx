import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Form,useForm} from '@ksf/sdk/form';import {TextField} from '@ksf/sdk/text-field';import {NumberField} from '@ksf/sdk/number-field';import {Checkbox} from '@ksf/sdk/checkbox';import {Select} from '@ksf/sdk/select';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FormDisabledExample(){const [disabled,setDisabled]=useState(true);return <div className='ksf-demo-stack'><Checkbox label='禁用表单' checked={disabled} onCheckedChange={setDisabled}/><Form disabled={disabled}><TextField label='名称'/><Select label='状态' options={[{value:'draft',label:'草稿'}]}/><Button type='submit'>提交</Button></Form></div>;}
