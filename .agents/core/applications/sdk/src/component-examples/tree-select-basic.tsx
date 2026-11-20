import {useState,useRef} from 'react';
import {TreeSelect} from '@ksf/sdk/tree-select';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TreeSelectBasicExample(){const [value,setValue]=useState('');return <div className='ksf-demo-stack'><TreeSelect searchable clearable defaultExpandAll label='资料位置' nodes={[{id:'team',label:'工作空间',children:[{id:'design',label:'设计资料'},{id:'develop',label:'开发资料'},{id:'locked',label:'归档资料',disabled:true}]},{id:'personal',label:'个人空间',children:[{id:'notes',label:'笔记'},{id:'tasks',label:'任务'}]}]} value={value} onValueChange={setValue} leafOnly/><output>{value||'尚未选择'}</output></div>;}
