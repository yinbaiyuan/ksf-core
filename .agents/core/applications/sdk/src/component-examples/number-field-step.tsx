import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {NumberField} from '@ksf/sdk/number-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function NumberFieldStepExample(){const [value,setValue]=useState<number|null>(1.5);return <div className='ksf-demo-stack'><NumberField label='精确步长' value={value} onValueChange={setValue} step={0.25} min={0} max={10}/><output>值：{value??'空'}</output></div>;}
