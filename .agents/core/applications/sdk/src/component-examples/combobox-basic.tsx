import {useState,useRef} from 'react';
import {Combobox} from '@ksf/sdk/combobox';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ComboboxBasicExample(){const [value,setValue]=useState('');return <div className='ksf-demo-stack'><Combobox label='寻找工作类型' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} value={value} onValueChange={setValue} placeholder='输入或选择' clearable/><output>{value||'尚未输入'}</output></div>;}
