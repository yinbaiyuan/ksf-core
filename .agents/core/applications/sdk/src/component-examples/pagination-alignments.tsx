import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Pagination} from '@ksf/sdk/pagination';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PaginationAlignmentsExample(){const [align,setAlign]=useState<'start'|'center'|'end'>('center');return <div className='ksf-demo-stack'><select aria-label='分页对齐' value={align} onChange={e=>setAlign(e.target.value as typeof align)}>{['start','center','end'].map(v=><option key={v}>{v}</option>)}</select><Pagination total={50} align={align} showTotal={false}/></div>;}
