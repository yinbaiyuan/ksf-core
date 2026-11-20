import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Lightbox} from '@ksf/sdk/lightbox';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function LightboxToolsExample(){const [open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>打开预览</Button><Lightbox open={open} onClose={()=>setOpen(false)} items={mediaSamples} /></>;}
