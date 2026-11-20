import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tabs,type TabItem} from '@ksf/sdk/tabs';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TabsIconsExample(){return <Tabs label='资料工作区' items={[{id:'folder',label:<span className='ksf-demo-row'><FolderGlyph/>资料</span>,content:'资料目录'},{id:'search',label:<span className='ksf-demo-row'><SearchGlyph/>搜索</span>,content:<TextField label='关键词' placeholder='输入关键词'/>},{id:'done',label:<span className='ksf-demo-row'><CheckGlyph/>已完成</span>,content:'已完成的任务'}]}/>;}
