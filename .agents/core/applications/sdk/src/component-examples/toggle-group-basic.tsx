import {useState,useRef} from 'react';
import {ToggleGroup} from '@ksf/sdk/toggle-group';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ToggleGroupBasicExample(){const [value,setValue]=useState('design');return <div className='ksf-demo-stack'><ToggleGroup label='工作视图' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} value={value} onValueChange={setValue}/><output>当前：{value}</output></div>;}
