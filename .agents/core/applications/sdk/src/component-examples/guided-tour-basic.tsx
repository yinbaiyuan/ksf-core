import {useState,useRef} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {GuidedTour} from '@ksf/sdk/guided-tour';
export function GuidedTourBasicExample(){const [open,setOpen]=useState(false),[index,setIndex]=useState(0),[result,setResult]=useState('未完成引导'),first=useRef<HTMLButtonElement>(null),second=useRef<HTMLButtonElement>(null);return <div className='ksf-demo-stack'><div className='ksf-demo-row'><Button ref={first}>选择资料</Button><Button ref={second}>查看结果</Button><Button variant='solid' tone='primary' onClick={()=>{setIndex(0);setOpen(true);}}>开始引导</Button></div><output>{result}</output><GuidedTour open={open} index={index} onIndexChange={setIndex} onClose={()=>setOpen(false)} onFinish={()=>setResult('引导已完成')} steps={[{id:'choose',heading:'选择资料',description:'先从当前窗口选择所需内容。',target:first},{id:'result',heading:'查看结果',description:'再在这里查看当前任务的结果。',target:second,placement:'top'}]}/></div>;}
