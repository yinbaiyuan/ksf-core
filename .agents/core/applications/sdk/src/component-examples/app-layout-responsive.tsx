import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {AppLayout} from '@ksf/sdk/app-layout';
import {Drawer} from '@ksf/sdk/drawer';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function AppLayoutResponsiveExample(){const [width,setWidth]=useState(600),[selected,setSelected]=useState('home');return <div className='ksf-demo-stack'><label>模拟容器宽度{width}px <input type='range' min='260' max='720' value={width} onChange={e=>setWidth(+e.target.value)}/></label><AppLayout header={<strong>{width<480?'窄容器':'宽容器'}</strong>} sidebar={<NavigationList label='示例导航' items={[{id:'home',label:'概览'},{id:'projects',label:'项目'},{id:'settings',label:'设置'}]} selectedId={selected} onSelect={setSelected}/>} sidebarCollapsed={width<480} sidebarWidth={150} style={{width,maxWidth:'100%',height:230,border:'1px solid var(--ksf-color-border)'}}><DemoPanel emphasis>当前：{selected}</DemoPanel></AppLayout></div>;}
