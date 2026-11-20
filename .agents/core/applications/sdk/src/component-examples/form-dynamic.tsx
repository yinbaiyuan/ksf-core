import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Form,useForm} from '@ksf/sdk/form';import {TextField} from '@ksf/sdk/text-field';import {NumberField} from '@ksf/sdk/number-field';import {Checkbox} from '@ksf/sdk/checkbox';import {Select} from '@ksf/sdk/select';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FormDynamicExample(){const [rows,setRows]=useState([{id:1,value:''}]),next=useRef(2);return <Form onCommit={()=>{}}>{rows.map(row=><div className='ksf-demo-row' key={row.id}><TextField label={'成员 '+row.id} name='members' value={row.value} onValueChange={value=>setRows(rows.map(r=>r.id===row.id?{...r,value}:r))}/><Button aria-label={'移除成员 '+row.id} onClick={()=>setRows(rows.filter(r=>r.id!==row.id))}>移除</Button></div>)}<Button onClick={()=>setRows([...rows,{id:next.current++,value:''}])}>添加成员</Button><Button type='submit'>提交</Button></Form>;}
