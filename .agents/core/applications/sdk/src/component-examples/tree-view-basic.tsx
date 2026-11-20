import {useState,useRef} from 'react';
import {TreeView} from '@ksf/sdk/tree-view';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TreeViewBasicExample(){const [selected,setSelected]=useState('design');return <div className='ksf-demo-stack'><TreeView label='资料目录' nodes={[{id:'team',label:'工作空间',children:[{id:'design',label:'设计资料'},{id:'develop',label:'开发资料'},{id:'locked',label:'归档资料',disabled:true}]},{id:'personal',label:'个人空间',children:[{id:'notes',label:'笔记'},{id:'tasks',label:'任务'}]}]} defaultExpandedIds={['team','personal']} selectedId={selected} onSelect={setSelected}/><output>当前：{selected}</output></div>;}
