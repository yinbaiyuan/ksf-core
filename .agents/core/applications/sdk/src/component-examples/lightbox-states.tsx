import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Lightbox} from '@ksf/sdk/lightbox';
export function LightboxStatesExample(){const [open,setOpen]=useState(false),[index,setIndex]=useState(1);return <div className='ksf-demo-stack'><Button onClick={()=>setOpen(true)}>受控图片预览</Button><output>当前第{index+1}张</output><Lightbox open={open} onClose={()=>setOpen(false)} items={mediaSamples} index={index} onIndexChange={setIndex} loop={false}/></div>;}
