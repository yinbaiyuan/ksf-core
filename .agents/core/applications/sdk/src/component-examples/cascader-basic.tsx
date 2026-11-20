import {useState,useRef} from 'react';
import {Cascader} from '@ksf/sdk/cascader';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CascaderBasicExample(){const [value,setValue]=useState<string[]>([]);return <div className='ksf-demo-stack'><Cascader label='选择空间' options={[{value:'office',label:'办公区',children:[{value:'meeting',label:'会议室',children:[{value:'a',label:'A 室'},{value:'b',label:'B 室'}]},{value:'studio',label:'工作室'}]},{value:'home',label:'居家区',children:[{value:'living',label:'客厅'},{value:'study',label:'书房'}]},{value:'later',label:'待开放',disabled:true}]} value={value} onValueChange={setValue}/><output>{value.join(' / ')||'尚未选择'}</output></div>;}
