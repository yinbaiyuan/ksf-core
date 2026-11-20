import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Grid,GridItem} from '@ksf/sdk/grid';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function GridAlignmentExample(){const [align,setAlign]=useState('center');return <div className='ksf-demo-stack'><select aria-label='网格对齐' value={align} onChange={e=>setAlign(e.target.value)}>{['start','center','end','stretch'].map(v=><option key={v}>{v}</option>)}</select><Grid columns={3} gap={8} style={{alignItems:align,minHeight:180}}>{[40,80,120].map(height=><DemoPanel key={height} emphasis style={{minHeight:height}}>高度{height}</DemoPanel>)}</Grid></div>;}
