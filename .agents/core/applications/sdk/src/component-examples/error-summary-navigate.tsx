import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ErrorSummary} from '@ksf/sdk/error-summary';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ErrorSummaryNavigateExample(){const id=useId();return <form><ErrorSummary errors={[{id:id+'-name',message:'请填写项目名称'},{id:id+'-owner',message:'请填写负责人'}]}/><TextField id={id+'-name'} label='项目名称' error='不能为空'/><TextField id={id+'-owner'} label='负责人' error='不能为空'/></form>;}
