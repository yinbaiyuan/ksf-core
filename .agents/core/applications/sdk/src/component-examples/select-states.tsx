import {useState,useRef} from 'react';
import {Select} from '@ksf/sdk/select';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SelectStatesExample(){return <div className='ksf-demo-stack'><Select label='分组选项' defaultValue='develop' options={[{value:'design',label:'设计',group:'制作'},{value:'develop',label:'开发',group:'制作'},{value:'review',label:'评审',group:'核验'}]}/><Select label='错误' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} error='请选择类型'/><Select label='禁用' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} disabled defaultValue='design'/></div>;}
