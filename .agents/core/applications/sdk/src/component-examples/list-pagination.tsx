import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {List} from '@ksf/sdk/list';import {Pagination} from '@ksf/sdk/pagination';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ListPaginationExample(){const [page,setPage]=useState(1),items=Array.from({length:60},(_,i)=>({id:String(i),name:'资料 '+(i+1),group:i<30?'设计':'研究'}));return <div className='ksf-demo-stack'><List label='分页资料' items={items.slice((page-1)*5,page*5)} getId={r=>r.id} renderItem={r=>r.name}/><Pagination total={items.length} pageSize={5} page={page} onPageChange={setPage}/></div>;}
