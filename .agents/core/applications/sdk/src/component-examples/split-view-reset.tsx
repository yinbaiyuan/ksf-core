import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SplitView} from '@ksf/sdk/split-view';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SplitViewResetExample(){return <div className='ksf-demo-stack'><SplitView defaultSizes={[30,70]} style={{height:180}} panels={[{id:'navigation',label:'导航',minSize:40,content:<DemoPanel style={{height:'100%'}}>导航区域</DemoPanel>},{id:'content',label:'内容',minSize:60,content:<DemoPanel emphasis style={{height:'100%'}}>内容区域</DemoPanel>}]}/><p>拖动后双击分隔条恢复3:7；方向键调整10px，Shift＋方向键40px，Home/End到边界。</p></div>;}
