import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tabs,type TabItem} from '@ksf/sdk/tabs';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TabsPreserveExample(){const [unmount,setUnmount]=useState(false);return <div className='ksf-demo-stack'><Button size='small' onClick={()=>setUnmount(v=>!v)}>{unmount?'改为保留草稿':'改为切换后卸载'}</Button><Tabs key={String(unmount)} label='草稿策略' unmountInactive={unmount} items={[{id:'draft',label:'草稿',content:<TextField label='草稿内容' defaultValue='可修改后切换'/>},{id:'other',label:'其他',content:'切回草稿查看保留效果。'}]}/></div>;}
