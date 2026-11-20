import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tabs,type TabItem} from '@ksf/sdk/tabs';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TabsCustomAddExample(){const [items,setItems]=useState<TabItem[]>([{id:'a',label:'初始页',content:'初始内容'}]);return <div className='ksf-demo-stack'><Button size='small' icon={<FolderGlyph/>} onClick={()=>setItems(old=>[...old,{id:'item-'+old.length,label:'新增'+old.length,content:'新增页签内容'}])}>添加资料页</Button><Tabs label='独立新增入口' items={items}/></div>;}
