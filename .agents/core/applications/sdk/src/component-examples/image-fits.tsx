import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Image} from '@ksf/sdk/image';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ImageFitsExample(){return <div className='ksf-demo-row'>{(['cover','contain','fill','none'] as const).map(fit=><figure key={fit}><Image src={mediaSamples[0].src} alt={fit} fit={fit} width={160} height={120}/><figcaption>{fit}</figcaption></figure>)}</div>;}
