import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TreeSelect} from '@ksf/sdk/tree-select';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TreeSelectStatusExample(){return <div className='ksf-demo-stack'><TreeSelect searchable clearable defaultExpandAll label="warning" nodes={[{id:'work',label:'工作区',children:[{id:'design',label:'设计'},{id:'research',label:'研究'}]},{id:'archive',label:'归档',children:[{id:'old',label:'旧资料',disabled:true}]}]} status="warning" /><TreeSelect searchable clearable defaultExpandAll label="error" nodes={[{id:'work',label:'工作区',children:[{id:'design',label:'设计'},{id:'research',label:'研究'}]},{id:'archive',label:'归档',children:[{id:'old',label:'旧资料',disabled:true}]}]} status="error" /></div>;}
