import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Pagination} from '@ksf/sdk/pagination';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PaginationControlledExample(){const [page,setPage]=useState(3);return <div className='ksf-demo-stack'><div className='ksf-demo-row'><Button size='small' onClick={()=>setPage(1)}>第一页</Button><Button size='small' onClick={()=>setPage(20)}>最后一页</Button></div><Pagination total={200} page={page} onPageChange={setPage}/><output>当前页：{page}</output></div>;}
