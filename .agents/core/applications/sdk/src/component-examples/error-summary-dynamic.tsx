import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ErrorSummary} from '@ksf/sdk/error-summary';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ErrorSummaryDynamicExample(){const id=useId(),[value,setValue]=useState(''),[checked,setChecked]=useState(false);return <form onSubmit={e=>{e.preventDefault();setChecked(true);}}><ErrorSummary errors={checked&&!value?[{id,message:'请输入名称'}]:[]}/><TextField id={id} label='名称' value={value} onValueChange={setValue}/><Button type='submit'>校验</Button></form>;}
