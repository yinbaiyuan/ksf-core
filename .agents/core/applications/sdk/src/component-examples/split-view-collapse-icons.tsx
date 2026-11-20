import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SplitView} from '@ksf/sdk/split-view';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SplitViewCollapseIconsExample(){const [mode,setMode]=useState<'auto'|'visible'|'hidden'>('auto');return <div className='ksf-demo-stack'><select aria-label='折叠控件显示' value={mode} onChange={e=>setMode(e.target.value as typeof mode)}>{['auto','visible','hidden'].map(v=><option key={v}>{v}</option>)}</select><SplitView collapseButtons={mode} style={{height:160}} panels={[{id:'a',label:'左面板',minSize:40,collapsible:true,content:<DemoPanel style={{height:'100%'}}>聚焦或悬停分隔条</DemoPanel>},{id:'b',label:'右面板',minSize:40,collapsible:true,content:<DemoPanel emphasis style={{height:'100%'}}>键盘Enter也可折叠</DemoPanel>}]}/></div>;}
