import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {AppLayout} from '@ksf/sdk/app-layout';
import {Drawer} from '@ksf/sdk/drawer';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function AppLayoutCustomTriggerExample(){const [collapsed,setCollapsed]=useState(false),[selected,setSelected]=useState('home');return <AppLayout header={<div className='ksf-demo-row'><Button size='small' aria-expanded={!collapsed} onClick={()=>setCollapsed(v=>!v)}>{collapsed?'展开导航':'收起导航'}</Button><strong>资料中心</strong></div>} sidebar={<NavigationList label='示例导航' items={[{id:'home',label:'概览'},{id:'projects',label:'项目'},{id:'settings',label:'设置'}]} selectedId={selected} onSelect={setSelected}/>} sidebarCollapsed={collapsed} sidebarWidth={150} style={{height:250,border:'1px solid var(--ksf-color-border)'}}><DemoPanel emphasis>当前：{selected}</DemoPanel></AppLayout>;}
