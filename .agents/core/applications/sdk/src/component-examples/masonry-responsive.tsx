import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Masonry} from '@ksf/sdk/masonry';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';
import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function MasonryResponsiveExample(){const [width,setWidth]=useState(500);return <div className='ksf-demo-stack'><label>容器宽度 <input type='range' min='200' max='700' value={width} onChange={e=>setWidth(+e.target.value)}/></label><Masonry columnWidth={140} gap={12} style={{width,maxWidth:'100%'}}>{[60,90,120,70,150,80,100,130].map((height,i)=><DemoPanel key={i} emphasis={i%2===0} style={{height}}>内容{i+1}</DemoPanel>)}</Masonry></div>;}
