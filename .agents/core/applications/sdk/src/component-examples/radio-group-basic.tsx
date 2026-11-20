import {useState,useRef} from 'react';
import {RadioGroup} from '@ksf/sdk/radio-group';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function RadioGroupBasicExample(){const [value,setValue]=useState('design');return <div className='ksf-demo-stack'><RadioGroup label='工作类型' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} value={value} onValueChange={setValue}/><output>已选：{value}</output></div>;}
