import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {List} from '@ksf/sdk/list';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ListScrolltoExample(){const root=useRef<HTMLDivElement>(null);return <div className='ksf-demo-stack'><Button onClick={()=>root.current?.scrollTo({top:44*30,behavior:'smooth'})}>定位第31项</Button><List ref={root} label='定位资料' items={Array.from({length:60},(_,i)=>({id:String(i),name:'资料 '+(i+1),group:i<30?'设计':'研究'}))} getId={r=>r.id} renderItem={r=>r.name} height={220} virtual itemHeight={44}/></div>;}
