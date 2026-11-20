import {useState,useRef} from 'react';
import {Combobox} from '@ksf/sdk/combobox';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ComboboxStatesExample(){return <div className='ksf-demo-stack'><Combobox label='只接受候选' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} allowCustom={false} description='方向键选择，Enter确认；Escape关闭'/><Combobox label='没有候选' options={[]} placeholder='可以输入自定义内容'/><Combobox label='禁用' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} disabled/></div>;}
