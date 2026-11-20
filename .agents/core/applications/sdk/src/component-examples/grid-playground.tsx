import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Grid,GridItem} from '@ksf/sdk/grid';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function GridPlaygroundExample(){const [columns,setColumns]=useState(3),[gap,setGap]=useState(12);return <div className='ksf-demo-stack'><div className='ksf-demo-row'><label>列数 <select value={columns} onChange={e=>setColumns(+e.target.value)}>{[1,2,3,4,6].map(v=><option key={v}>{v}</option>)}</select></label><label>间隔 <input type='range' min='0' max='24' value={gap} onChange={e=>setGap(+e.target.value)}/></label></div><Grid columns={columns} gap={gap}>{Array.from({length:12},(_,i)=><DemoPanel key={i} emphasis style={{padding:8,textAlign:'center'}}>{i+1}</DemoPanel>)}</Grid></div>;}
