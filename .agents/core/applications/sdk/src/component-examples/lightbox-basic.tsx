import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Lightbox} from '@ksf/sdk/lightbox';
export function LightboxBasicExample(){const [open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>打开图片集合</Button><Lightbox open={open} onClose={()=>setOpen(false)} items={mediaSamples}/></>;}
