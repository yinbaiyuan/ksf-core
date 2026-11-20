import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {AppLayout} from '@ksf/sdk/app-layout';
import {Drawer} from '@ksf/sdk/drawer';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function AppLayoutFixedHeaderExample(){return <AppLayout header={<strong>始终可见的头部</strong>} footer='固定底部状态' style={{height:260,border:'1px solid var(--ksf-color-border)'}}><div className='ksf-demo-stack'>{Array.from({length:12},(_,i)=><DemoPanel key={i}>可滚动内容{i+1}</DemoPanel>)}</div></AppLayout>;}
