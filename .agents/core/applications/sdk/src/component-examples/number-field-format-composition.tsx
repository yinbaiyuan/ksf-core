import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {NumberField} from '@ksf/sdk/number-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function NumberFieldFormatCompositionExample(){const [value,setValue]=useState<number|null>(1234.5);return <div className='ksf-demo-stack'><NumberField label='金额原值' value={value} onValueChange={setValue} step={0.1}/><output>格式化展示：{value===null?'暂无金额':new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(value)}</output></div>;}
