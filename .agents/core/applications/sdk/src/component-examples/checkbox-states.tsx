import {useState,useRef} from 'react';
import {Checkbox,CheckboxGroup} from '@ksf/sdk/checkbox';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CheckboxStatesExample(){return <form className='ksf-demo-stack'><Checkbox label='接收提醒' name='notify' defaultChecked/><Checkbox label='只读展示的禁用项' disabled defaultChecked/><CheckboxGroup label='归档类型' name='kind' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} defaultValue={['review']}/><Button type='reset'>还原选择</Button></form>;}
