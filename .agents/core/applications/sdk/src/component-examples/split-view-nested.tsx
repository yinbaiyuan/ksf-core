import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SplitView} from '@ksf/sdk/split-view';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SplitViewNestedExample(){return <SplitView style={{height:300}} panels={[{id:'left',label:'目录',minSize:80,content:<DemoPanel style={{height:'100%'}}>目录</DemoPanel>},{id:'right',label:'工作区',minSize:100,content:<SplitView orientation='vertical' style={{height:'100%'}} panels={[{id:'editor',label:'编辑器',minSize:60,content:<DemoPanel emphasis style={{height:'100%'}}>编辑器</DemoPanel>},{id:'console',label:'输出',minSize:50,content:<DemoPanel style={{height:'100%'}}>输出区域</DemoPanel>}]}/>}]} />;}
