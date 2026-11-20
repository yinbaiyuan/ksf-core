import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Image} from '@ksf/sdk/image';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ImageErrorExample(){return <Image src='data:image/png;base64,broken' errorContent='这张图片无法载入' alt='空间方案' width={240} height={150}/>;}
