import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tabs,type TabItem} from '@ksf/sdk/tabs';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TabsOverflowExample(){return <Tabs label='长页签列表' items={Array.from({length:16},(_,i)=>({id:String(i),label:'资料页签'+(i+1),content:<DemoPanel>第{i+1}项内容；焦点可用方向键在页签间移动。</DemoPanel>}))}/>;}
