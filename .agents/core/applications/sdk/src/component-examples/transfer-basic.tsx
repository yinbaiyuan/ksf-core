import {useState,useRef} from 'react';
import {Transfer} from '@ksf/sdk/transfer';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TransferBasicExample(){const [value,setValue]=useState<string[]>(['review']);return <div className='ksf-demo-stack'><Transfer label='资料分配' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} value={value} onValueChange={setValue}/><output>已选：{value.join('、')||'无'}</output></div>;}
