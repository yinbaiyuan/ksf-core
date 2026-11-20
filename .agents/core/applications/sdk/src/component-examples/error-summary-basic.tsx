import {useState} from 'react';
import {ErrorSummary} from '@ksf/sdk/error-summary';
import {TextField} from '@ksf/sdk/text-field';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ErrorSummaryBasicExample(){const [show,setShow]=useState(true);return <form className='ksf-demo-stack'><ErrorSummary errors={show?[{id:'summary-title',message:'请填写项目名称'},{id:'summary-email',message:'请检查联系邮箱'}]:[]}/><TextField id='summary-title' label='项目名称'/><TextField id='summary-email' label='联系邮箱' type='email'/><Button onClick={()=>setShow(v=>!v)}>切换错误摘要</Button></form>;}
