import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SplitView} from '@ksf/sdk/split-view';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SplitViewControlledExample(){const [sizes,setSizes]=useState<readonly number[]>([30,70]);return <div className='ksf-demo-stack'><div className='ksf-demo-row'><Button size='small' onClick={()=>setSizes([50,50])}>均分</Button><Button size='small' onClick={()=>setSizes([25,75])}>1:3</Button><output>{sizes.map(v=>v.toFixed(0)).join(' : ')}</output></div><SplitView style={{height:180}} sizes={sizes} onSizesChange={setSizes} panels={[{id:'navigation',label:'导航',minSize:40,content:<DemoPanel style={{height:'100%'}}>导航区域</DemoPanel>},{id:'content',label:'内容',minSize:60,content:<DemoPanel emphasis style={{height:'100%'}}>内容区域</DemoPanel>}]}/></div>;}
