import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {Form} from '@ksf/sdk/form';
import {Field} from '@ksf/sdk/field';
import {TextField} from '@ksf/sdk/text-field';
import {ToggleGroup} from '@ksf/sdk/toggle-group';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FormLayoutsExample(){const [layout,setLayout]=useState<'horizontal'|'vertical'|'inline'>('horizontal');return <div className="ksf-demo-stack"><ToggleGroup label="表单布局" options={[{value:'horizontal',label:'水平'},{value:'vertical',label:'垂直'},{value:'inline',label:'行内'}]} value={layout} onValueChange={value=>setLayout(value as typeof layout)}/><Form layout={layout} labelWidth={80} onCommit={()=>{}}><Field label="姓名">{control=><TextField {...control} name="name" placeholder="请输入"/>}</Field><Button type="submit">提交</Button></Form></div>;}
