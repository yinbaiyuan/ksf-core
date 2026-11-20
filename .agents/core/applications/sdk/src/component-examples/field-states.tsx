import {useState} from 'react';
import {Field} from '@ksf/sdk/field';
import {TextField} from '@ksf/sdk/text-field';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FieldStatesExample(){const [value,setValue]=useState('');return <Field label='确认文字' error={value==='确认'?undefined:'请输入“确认”'}>{control=><input {...control} value={value} onChange={e=>setValue(e.target.value)} className='ksf-input ksf-demo-box'/>}</Field>;}
