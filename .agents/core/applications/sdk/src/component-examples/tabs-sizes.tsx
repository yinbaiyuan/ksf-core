import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tabs,type TabItem} from '@ksf/sdk/tabs';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TabsSizesExample(){const [size,setSize]=useState<'small'|'medium'|'large'>('medium');return <div className='ksf-demo-stack'><select aria-label='页签尺寸' value={size} onChange={e=>setSize(e.target.value as typeof size)}>{['small','medium','large'].map(v=><option key={v}>{v}</option>)}</select><Tabs size={size} label='尺寸示例' items={[{id:'overview',label:'概览',content:<DemoPanel>概览内容</DemoPanel>},{id:'detail',label:'详情',content:<DemoPanel emphasis>详情内容</DemoPanel>},{id:'history',label:'历史',content:<DemoPanel>历史记录</DemoPanel>}]}/></div>;}
