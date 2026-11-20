import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SplitView} from '@ksf/sdk/split-view';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SplitViewDeferredExample(){const [sizes,setSizes]=useState<number[]>([50,50]),[commits,setCommits]=useState(0);return <div className='ksf-demo-stack'><output>已提交{commits}次：{sizes.map(v=>v.toFixed(0)).join(' : ')}</output><SplitView resizeMode='deferred' style={{height:190}} defaultSizes={[50,50]} onSizesChange={next=>{setSizes(next);setCommits(v=>v+1);}} panels={[{id:'navigation',label:'导航',minSize:40,content:<DemoPanel style={{height:'100%'}}>导航区域</DemoPanel>},{id:'content',label:'内容',minSize:60,content:<DemoPanel emphasis style={{height:'100%'}}>内容区域</DemoPanel>}]}/><span>拖动时显示预览分隔条，松开后更新面板；Escape取消。</span></div>;}
