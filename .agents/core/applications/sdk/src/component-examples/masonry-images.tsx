import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Masonry} from '@ksf/sdk/masonry';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';
import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function MasonryImagesExample(){return <Masonry columns={3} gap={10}>{mediaSamples.concat(mediaSamples).map((item,i)=><figure style={{margin:0}} key={i}><img src={item.src} alt={item.alt} style={{display:'block',width:'100%',height:[90,140,110][i%3],objectFit:'cover',borderRadius:6}}/><figcaption style={{fontSize:12,paddingTop:6}}>{item.caption}</figcaption></figure>)}</Masonry>;}
