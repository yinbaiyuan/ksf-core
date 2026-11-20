import {useState,useRef} from 'react';
import {SearchField} from '@ksf/sdk/search-field';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SearchFieldStatesExample(){const [loading,setLoading]=useState(false);return <div className='ksf-demo-stack'><SearchField label='异步搜索' loading={loading} defaultValue='Button' onSearch={()=>setLoading(true)}/><Button disabled={!loading} onClick={()=>setLoading(false)}>完成本次搜索</Button><SearchField label='不可用搜索' disabled/></div>;}
