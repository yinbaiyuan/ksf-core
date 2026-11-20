import {useState,useRef,useId} from 'react';
import {Tabs} from '@ksf/sdk/tabs';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TabsStatesExample(){const [ids,setIds]=useState(['方案一','方案二']);return <Tabs label='可编辑页签' appearance='card' activation='manual' items={ids.map(id=>({id,label:id,content:<input aria-label={id+'草稿'} placeholder='切换页签后仍保留草稿'/>,closable:true}))} onClose={id=>setIds(v=>v.filter(x=>x!==id))} onAdd={()=>setIds(v=>[...v,`方案${Date.now().toString().slice(-4)}`])}/>;}
