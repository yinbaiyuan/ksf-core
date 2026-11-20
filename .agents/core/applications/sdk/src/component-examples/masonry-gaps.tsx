import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Masonry} from '@ksf/sdk/masonry';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';
import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function MasonryGapsExample(){const [gap,setGap]=useState(12),[columns,setColumns]=useState(3);return <div className='ksf-demo-stack'><div className='ksf-demo-row'><label>列数 <select value={columns} onChange={e=>setColumns(+e.target.value)}>{[1,2,3,4].map(v=><option key={v}>{v}</option>)}</select></label><label>间距 <input type='range' min='0' max='24' value={gap} onChange={e=>setGap(+e.target.value)}/></label></div><Masonry columns={columns} gap={gap}>{[80,120,100,60,140,90].map((height,i)=><DemoPanel key={i} emphasis style={{height}}>{i+1}</DemoPanel>)}</Masonry></div>;}
