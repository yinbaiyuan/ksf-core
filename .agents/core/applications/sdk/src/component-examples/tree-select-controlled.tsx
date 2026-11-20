import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TreeSelect} from '@ksf/sdk/tree-select';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TreeSelectControlledExample(){const [value,setValue]=useState<string>('');return <div className='ksf-demo-stack'><TreeSelect searchable clearable defaultExpandAll label='受控值' nodes={[{id:'work',label:'工作区',children:[{id:'design',label:'设计'},{id:'research',label:'研究'}]},{id:'archive',label:'归档',children:[{id:'old',label:'旧资料',disabled:true}]}]} value={value} onValueChange={setValue}/><output>{JSON.stringify(value)}</output><Button onClick={()=>setValue('')}>清空</Button></div>;}
