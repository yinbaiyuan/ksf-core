import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Image} from '@ksf/sdk/image';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ImageContainExample(){return <Image src={mediaSamples[0].src} fit='contain' alt='空间方案' width={240} height={150}/>;}
