import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Grid,GridItem} from '@ksf/sdk/grid';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function GridGapsExample(){const [gap,setGap]=useState(16);return <div className='ksf-demo-stack'><label>间隔{gap}px <input type='range' min='0' max='32' value={gap} onChange={e=>setGap(+e.target.value)}/></label><Grid columns={3} gap={`${gap}px ${gap/2}px`}>{Array.from({length:6},(_,i)=><DemoPanel key={i} emphasis>{i+1}</DemoPanel>)}</Grid></div>;}
