import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tabs,type TabItem} from '@ksf/sdk/tabs';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TabsEditableExample(){const sequence=useRef(3),[items,setItems]=useState<TabItem[]>([{id:'1',label:'资料1',closable:true,content:<TextField label='资料1草稿' defaultValue='关闭前保留草稿'/>},{id:'2',label:'资料2',closable:true,content:'资料2内容'}]);return <Tabs appearance='card' label='可编辑工作区' items={items} onAdd={()=>{const id=String(sequence.current++);setItems(old=>[...old,{id,label:'资料'+id,closable:true,content:'新资料内容'}]);}} onClose={id=>setItems(old=>old.filter(item=>item.id!==id))}/>;}
