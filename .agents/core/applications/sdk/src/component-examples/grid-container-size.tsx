import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Grid,GridItem} from '@ksf/sdk/grid';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function GridContainerSizeExample(){const node=useRef<HTMLDivElement>(null),[size,setSize]=useState(0),[width,setWidth]=useState(500);useEffect(()=>{const el=node.current;if(!el)return;const observer=new ResizeObserver(([entry])=>setSize(Math.round(entry.contentRect.width)));observer.observe(el);return()=>observer.disconnect();},[]);return <div className='ksf-demo-stack'><label>测试宽度 <input type='range' min='200' max='700' value={width} onChange={e=>setWidth(+e.target.value)}/></label><div ref={node} style={{width,maxWidth:'100%'}}><output>实际宽度{size}px</output><Grid columns={size<340?1:size<540?2:3} gap={8}>{[1,2,3].map(i=><DemoPanel emphasis key={i}>{i}</DemoPanel>)}</Grid></div></div>;}
