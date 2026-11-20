import {useState} from 'react';
import {DescriptionList} from '@ksf/sdk/description-list';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DescriptionListStatesExample(){const [vertical,setVertical]=useState(true);return <div className='ksf-demo-stack'><Button onClick={()=>setVertical(v=>!v)}>切换标签排列</Button><DescriptionList bordered columns={2} orientation={vertical?'vertical':'horizontal'} size='small' items={[{id:'id',label:'编号',content:'KSF-20261118'},{id:'type',label:'类型',content:'方案资料'},{id:'detail',label:'范围',content:'长内容会在当前字段内换行，不撑开窗口。',span:2}]}/></div>;}
