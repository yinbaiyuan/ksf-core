import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SplitView} from '@ksf/sdk/split-view';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SplitViewMultipleExample(){return <SplitView style={{height:200}} defaultSizes={[20,50,30]} panels={['目录','编辑','检查'].map((label,i)=>({id:String(i),label,minSize:50,collapsible:i!==1,content:<DemoPanel emphasis={i===1} style={{height:'100%'}}>{label}</DemoPanel>}))}/>;}
