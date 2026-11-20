import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SplitView} from '@ksf/sdk/split-view';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SplitViewCollapsibleExample(){const [collapsed,setCollapsed]=useState<readonly string[]>([]);return <div className='ksf-demo-stack'><Button size='small' onClick={()=>setCollapsed(collapsed.length?[]:['navigation'])}>{collapsed.length?'展开导航':'折叠导航'}</Button><SplitView style={{height:180}} collapsed={collapsed} onCollapsedChange={setCollapsed} collapseButtons='visible' panels={[{id:'navigation',label:'导航',collapsible:true,minSize:40,content:<DemoPanel style={{height:'100%'}}>可折叠导航</DemoPanel>},{id:'content',label:'内容',minSize:60,content:<DemoPanel emphasis style={{height:'100%'}}>始终保留内容面板</DemoPanel>}]}/></div>;}
