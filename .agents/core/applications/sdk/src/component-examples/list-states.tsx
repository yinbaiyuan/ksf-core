import {useState} from 'react';
import {List} from '@ksf/sdk/list';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ListStatesExample(){const [empty,setEmpty]=useState(false);const items=Array.from({length:1000},(_,index)=>({id:String(index),title:`资料记录 ${index+1}`}));return <div className='ksf-demo-stack'><Button onClick={()=>setEmpty(v=>!v)}>切换空列表</Button><List label='一千项虚拟资料' items={empty?[]:items} getId={item=>item.id} renderItem={item=><span>{item.title}</span>} height={200} virtual itemHeight={48}/><span className='ksf-demo-muted'>只渲染可见范围与预留行。</span></div>;}
