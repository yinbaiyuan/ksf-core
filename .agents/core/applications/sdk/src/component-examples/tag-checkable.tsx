import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tag} from '@ksf/sdk/tag';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TagCheckableExample(){const [selected,setSelected]=useState(['设计']);return <div className='ksf-demo-row'>{['设计','研究','开发'].map(t=><Tag key={t} checkable selected={selected.includes(t)} onSelectedChange={v=>setSelected(v?[...selected,t]:selected.filter(x=>x!==t))}>{t}</Tag>)}</div>;}
