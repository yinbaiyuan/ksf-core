import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SplitView} from '@ksf/sdk/split-view';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SplitViewCustomStyleExample(){return <SplitView style={{height:180,border:'1px solid var(--ksf-color-primary)',borderRadius:12,padding:8}} panels={[{id:'navigation',label:'导航',minSize:40,content:<DemoPanel style={{height:'100%'}}>导航区域</DemoPanel>},{id:'content',label:'内容',minSize:60,content:<DemoPanel emphasis style={{height:'100%'}}>内容区域</DemoPanel>}]}/>;}
