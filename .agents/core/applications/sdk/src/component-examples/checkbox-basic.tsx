import {useState,useRef} from 'react';
import {Checkbox,CheckboxGroup} from '@ksf/sdk/checkbox';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CheckboxBasicExample(){const [value,setValue]=useState<string[]>(['design']);return <div className='ksf-demo-stack'><Checkbox label='全选工作类型' checked={value.length===3} indeterminate={value.length>0&&value.length<3} onCheckedChange={checked=>setValue(checked?['design','develop','review']:[])}/><CheckboxGroup label='工作类型' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} value={value} onValueChange={setValue}/><output>{value.join('、')||'未选择'}</output></div>;}
