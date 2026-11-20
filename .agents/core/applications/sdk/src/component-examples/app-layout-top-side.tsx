import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {AppLayout} from '@ksf/sdk/app-layout';
import {Drawer} from '@ksf/sdk/drawer';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function AppLayoutTopSideExample(){const [selected,setSelected]=useState('home');return <AppLayout header={<strong>项目工作台</strong>} sidebar={<NavigationList label='示例导航' items={[{id:'home',label:'概览'},{id:'projects',label:'项目'},{id:'settings',label:'设置'}]} selectedId={selected} onSelect={setSelected}/>} sidebarWidth={150} footer='状态信息' style={{height:280,border:'1px solid var(--ksf-color-border)'}}><DemoPanel emphasis>当前页面：{selected}</DemoPanel></AppLayout>;}
