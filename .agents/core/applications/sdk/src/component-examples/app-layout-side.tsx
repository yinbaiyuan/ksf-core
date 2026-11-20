import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {AppLayout} from '@ksf/sdk/app-layout';
import {Drawer} from '@ksf/sdk/drawer';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function AppLayoutSideExample(){const [selected,setSelected]=useState('home');return <AppLayout sidebar={<div className='ksf-demo-stack'><strong>资料中心</strong>{<NavigationList label='示例导航' items={[{id:'home',label:'概览'},{id:'projects',label:'项目'},{id:'settings',label:'设置'}]} selectedId={selected} onSelect={setSelected}/>}</div>} sidebarWidth={150} style={{height:260,border:'1px solid var(--ksf-color-border)'}}><DemoPanel emphasis>工作内容：{selected}</DemoPanel></AppLayout>;}
