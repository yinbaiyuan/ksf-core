import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {List} from '@ksf/sdk/list';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ListStickyExample(){return <List label='项目资料' items={Array.from({length:60},(_,i)=>({id:String(i),name:'资料 '+(i+1),group:i<30?'设计':'研究'}))} getId={r=>r.id} renderItem={r=><span>{r.name}</span>} height={240} groupBy={r=>r.group} stickyHeaders/>;}
