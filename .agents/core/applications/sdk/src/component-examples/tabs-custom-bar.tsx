import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tabs,type TabItem} from '@ksf/sdk/tabs';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TabsCustomBarExample(){return <Tabs label='自定义条外观' barStyle={{padding:12,borderRadius:10,background:'var(--ksf-color-primary-surface)',borderBottom:0}} indicatorStyle={{color:'var(--ksf-color-primary)',borderBottomWidth:3}} items={[{id:'overview',label:'概览',content:<DemoPanel>概览内容</DemoPanel>},{id:'detail',label:'详情',content:<DemoPanel emphasis>详情内容</DemoPanel>},{id:'history',label:'历史',content:<DemoPanel>历史记录</DemoPanel>}]}/>;}
