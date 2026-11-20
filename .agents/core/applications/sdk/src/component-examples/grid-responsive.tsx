import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Grid,GridItem} from '@ksf/sdk/grid';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function GridResponsiveExample(){const [width,setWidth]=useState(540);return <div className='ksf-demo-stack'><label>容器宽度{width}px <input type='range' min='220' max='720' value={width} onChange={e=>setWidth(+e.target.value)}/></label><div style={{width,maxWidth:'100%'}}><Grid minItemWidth={150} gap={10}>{Array.from({length:6},(_,i)=><DemoPanel key={i} emphasis>{i+1}</DemoPanel>)}</Grid></div></div>;}
