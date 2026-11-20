import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SplitView} from '@ksf/sdk/split-view';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SplitViewConstraintsExample(){return <div className='ksf-demo-stack'><SplitView style={{height:180}} panels={[{id:'bounded',label:'受限面板',minSize:80,maxSize:180,content:<DemoPanel style={{height:'100%'}}>80px至180px</DemoPanel>},{id:'rest',label:'弹性面板',minSize:80,content:<DemoPanel emphasis style={{height:'100%'}}>剩余空间</DemoPanel>}]}/><span>拖动分隔条时不会突破面板约束。</span></div>;}
