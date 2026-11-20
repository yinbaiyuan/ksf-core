import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {List} from '@ksf/sdk/list';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ListActionsExample(){const [items,setItems]=useState([{id:'a',name:'需求文档'},{id:'b',name:'设计说明'}]);return <List label='资料操作' items={items} getId={r=>r.id} renderItem={r=><div className='ksf-demo-row'><strong>{r.name}</strong><Button size='small' onClick={()=>setItems(items.filter(v=>v.id!==r.id))}>移除</Button></div>}/>;}
