import {useState,useRef} from 'react';
import {Select} from '@ksf/sdk/select';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SelectBasicExample(){const [value,setValue]=useState('');return <div className='ksf-demo-stack'><Select label='工作类型' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} value={value} onValueChange={setValue} clearable/><output>{value||'尚未选择'}</output></div>;}
