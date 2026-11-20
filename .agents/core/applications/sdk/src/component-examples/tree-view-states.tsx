import {useState,useRef} from 'react';
import {TreeView} from '@ksf/sdk/tree-view';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TreeViewStatesExample(){const [checked,setChecked]=useState<string[]>(['design']);const [filter,setFilter]=useState('');return <div className='ksf-demo-stack'><label>过滤目录<input value={filter} onChange={e=>setFilter(e.target.value)}/></label><TreeView label='复选目录' nodes={[{id:'team',label:'工作空间',children:[{id:'design',label:'设计资料'},{id:'develop',label:'开发资料'},{id:'locked',label:'归档资料',disabled:true}]},{id:'personal',label:'个人空间',children:[{id:'notes',label:'笔记'},{id:'tasks',label:'任务'}]}]} filter={filter} checkable checkedIds={checked} onCheckedChange={setChecked} defaultExpandedIds={['team']}/><output>{checked.join('、')||'未选择'}</output></div>;}
