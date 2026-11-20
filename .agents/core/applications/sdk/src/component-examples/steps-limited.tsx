import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Steps} from '@ksf/sdk/steps';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function StepsLimitedExample(){const [current,setCurrent]=useState(4);return <div className='ksf-demo-stack'><Steps current={current} maxVisible={3} onStepSelect={setCurrent} items={Array.from({length:10},(_,i)=>({id:String(i),title:'步骤'+(i+1)}))}/><div className='ksf-demo-row'><Button size='small' disabled={!current} onClick={()=>setCurrent(v=>v-1)}>上一步</Button><Button size='small' disabled={current===9} onClick={()=>setCurrent(v=>v+1)}>下一步</Button><output>总共10步，当前{current+1}</output></div></div>;}
