import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SplitView} from '@ksf/sdk/split-view';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SplitViewDisabledExample(){const [disabled,setDisabled]=useState(true);return <div className='ksf-demo-stack'><Button size='small' onClick={()=>setDisabled(v=>!v)}>{disabled?'启用调整':'停用调整'}</Button><SplitView disabled={disabled} style={{height:160}} panels={[{id:'navigation',label:'导航',minSize:40,content:<DemoPanel style={{height:'100%'}}>导航区域</DemoPanel>},{id:'content',label:'内容',minSize:60,content:<DemoPanel emphasis style={{height:'100%'}}>内容区域</DemoPanel>}]}/></div>;}
