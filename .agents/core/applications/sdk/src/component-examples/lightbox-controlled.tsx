import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Lightbox} from '@ksf/sdk/lightbox';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function LightboxControlledExample(){const [open,setOpen]=useState(false),[index,setIndex]=useState(0);return <div className='ksf-demo-row'>{mediaSamples.map((item,i)=><Button key={item.id} onClick={()=>{setIndex(i);setOpen(true);}}>预览 {i+1}</Button>)}<Lightbox open={open} onClose={()=>setOpen(false)} items={mediaSamples} index={index} onIndexChange={setIndex}/></div>;}
