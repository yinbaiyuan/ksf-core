import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TreeSelect} from '@ksf/sdk/tree-select';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TreeSelectDisabledExample(){return <div className='ksf-demo-stack'><TreeSelect searchable clearable defaultExpandAll label="enabled" nodes={[{id:'work',label:'工作区',children:[{id:'design',label:'设计'},{id:'research',label:'研究'}]},{id:'archive',label:'归档',children:[{id:'old',label:'旧资料',disabled:true}]}]}  /><TreeSelect searchable clearable defaultExpandAll label="disabled" nodes={[{id:'work',label:'工作区',children:[{id:'design',label:'设计'},{id:'research',label:'研究'}]},{id:'archive',label:'归档',children:[{id:'old',label:'旧资料',disabled:true}]}]} disabled /></div>;}
