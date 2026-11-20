import {useState,useRef} from 'react';
import {Transfer} from '@ksf/sdk/transfer';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TransferStatesExample(){return <div className='ksf-demo-stack'><Transfer label='禁用资料分配' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} disabled defaultValue={['design']}/><Transfer label='空资料' options={[]} searchable={false}/></div>;}
