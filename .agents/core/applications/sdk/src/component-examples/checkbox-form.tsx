import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Checkbox,CheckboxGroup} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CheckboxFormExample(){const [message,setMessage]=useState('');return <form className='ksf-demo-stack' onSubmit={event=>{event.preventDefault();setMessage(new FormData(event.currentTarget).getAll('scope').join('、')||'无');}}><CheckboxGroup label='提交范围' name='scope' defaultValue={['read']} options={[{value:'read',label:'阅读'},{value:'edit',label:'编辑'}]}/><div className='ksf-demo-row'><Button type='submit'>提交</Button><Button type='reset'>重置</Button></div><output>{message}</output></form>;}
