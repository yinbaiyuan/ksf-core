import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tabs,type TabItem} from '@ksf/sdk/tabs';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TabsIndicatorExample(){return <Tabs label='指示条示例' indicatorStyle={{borderBottomWidth:4,borderBottomColor:'var(--ksf-color-success)',color:'var(--ksf-color-success)'}} items={[{id:'overview',label:'概览',content:<DemoPanel>概览内容</DemoPanel>},{id:'detail',label:'详情',content:<DemoPanel emphasis>详情内容</DemoPanel>},{id:'history',label:'历史',content:<DemoPanel>历史记录</DemoPanel>}]}/>;}
