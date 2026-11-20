import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {GuidedTour} from '@ksf/sdk/guided-tour';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function GuidedTourControlledExample(){const [open,setOpen]=useState(false),[index,setIndex]=useState(0);return <div className='ksf-demo-row'><Button onClick={()=>{setIndex(1);setOpen(true);}}>从第二步开始</Button><GuidedTour open={open} index={index} onIndexChange={setIndex} onClose={()=>setOpen(false)} steps={[{id:'a',heading:'第一步'},{id:'b',heading:'第二步'},{id:'c',heading:'最后一步'}]}/></div>;}
