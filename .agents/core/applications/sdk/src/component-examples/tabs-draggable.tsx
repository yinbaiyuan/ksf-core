import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tabs,type TabItem} from '@ksf/sdk/tabs';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TabsDraggableExample(){const [order,setOrder]=useState(['概览','详情','历史']),dragged=useRef<string|null>(null);return <div className='ksf-demo-stack'><Tabs label='拖动排序页签' items={order.map(label=>({id:label,label:<span draggable style={{cursor:'grab'}} onDragStart={()=>{dragged.current=label;}} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const from=dragged.current;if(!from||from===label)return;setOrder(old=>{const next=old.filter(value=>value!==from);next.splice(next.indexOf(label),0,from);return next;});dragged.current=null;}}>{label}</span>,content:<DemoPanel>{label}内容</DemoPanel>}))}/><output>当前顺序：{order.join('、')}</output></div>;}
