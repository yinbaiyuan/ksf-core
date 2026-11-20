import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Image} from '@ksf/sdk/image';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ImagePreviewSourceExample(){return <Image src={mediaSamples[0].src} preview previewSrc={mediaSamples[1].src} alt='空间方案' width={240} height={150}/>;}
