import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TreeView} from '@ksf/sdk/tree-view';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TreeViewSearchExample(){const [filter,setFilter]=useState('');return <div className='ksf-demo-stack'><TextField label='筛选节点' value={filter} onValueChange={setFilter}/><TreeView label='项目树' nodes={[{id:'root',label:'项目',children:[{id:'design',label:'设计',children:[{id:'ui',label:'界面'},{id:'motion',label:'动效'}]},{id:'research',label:'研究'},{id:'disabled',label:'暂不可用',disabled:true}]}]} defaultExpandedIds={['root','design']}  filter={filter}/></div>;}
