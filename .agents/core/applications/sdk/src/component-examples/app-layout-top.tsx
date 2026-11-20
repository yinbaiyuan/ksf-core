import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {AppLayout} from '@ksf/sdk/app-layout';
import {Drawer} from '@ksf/sdk/drawer';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function AppLayoutTopExample(){return <AppLayout header={<strong>工作区</strong>} footer='底部说明' style={{height:240,border:'1px solid var(--ksf-color-border)',borderRadius:8}}><DemoPanel emphasis>主要内容区域</DemoPanel></AppLayout>;}
