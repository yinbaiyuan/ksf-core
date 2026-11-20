import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {AttachmentList,type Attachment} from '@ksf/sdk/attachment-list';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';import {Lightbox} from '@ksf/sdk/lightbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AttachmentListPreviewExample(){const [open,setOpen]=useState(false),[index,setIndex]=useState(0);return <><AttachmentList items={mediaSamples.map(i=>({id:i.id,name:i.alt,thumbnail:i.src,status:'done'}))} layout='picture' onPreview={item=>{setIndex(mediaSamples.findIndex(i=>i.id===item.id));setOpen(true);}}/><Lightbox open={open} onClose={()=>setOpen(false)} items={mediaSamples} index={index} onIndexChange={setIndex}/></>;}
