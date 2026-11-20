import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {List} from '@ksf/sdk/list';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ListEmptyExample(){const [items,setItems]=useState<string[]>([]);return <List label='新建清单' items={items} getId={r=>r} renderItem={r=>r} empty={<Button onClick={()=>setItems(['第一份资料'])}>创建资料</Button>}/>;}
