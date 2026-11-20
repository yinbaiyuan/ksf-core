import {useState,useRef} from 'react';
import {NumberField} from '@ksf/sdk/number-field';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function NumberFieldBasicExample(){const [value,setValue]=useState<number|null>(3);return <div className='ksf-demo-stack'><NumberField label='参与人数' value={value} onValueChange={setValue} min={1} max={10} step={1}/><output>{value===null?'尚未填写':`${value} 人`}</output></div>;}
