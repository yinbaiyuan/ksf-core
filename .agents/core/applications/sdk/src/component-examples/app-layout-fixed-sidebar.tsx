import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {AppLayout} from '@ksf/sdk/app-layout';
import {Drawer} from '@ksf/sdk/drawer';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function AppLayoutFixedSidebarExample(){const [selected,setSelected]=useState('home');return <AppLayout sidebar={<NavigationList label='长侧栏' items={Array.from({length:18},(_,i)=>({id:String(i),label:'导航项目'+(i+1)}))} selectedId={selected} onSelect={setSelected}/>} sidebarWidth={170} style={{height:280,border:'1px solid var(--ksf-color-border)'}}><div className='ksf-demo-stack'>{Array.from({length:12},(_,i)=><DemoPanel emphasis key={i}>当前导航{selected} · 内容{i+1}</DemoPanel>)}</div></AppLayout>;}
