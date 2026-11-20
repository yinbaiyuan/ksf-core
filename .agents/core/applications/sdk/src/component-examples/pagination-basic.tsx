import {useState,useRef,useId} from 'react';
import {Pagination} from '@ksf/sdk/pagination';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PaginationBasicExample(){const [page,setPage]=useState(1),[size,setSize]=useState(10);return <div className='ksf-demo-stack'><Pagination total={167} page={page} onPageChange={setPage} pageSize={size} onPageSizeChange={setSize} showSizeChanger showQuickJumper/><output>第 {page} 页，每页 {size} 条</output></div>;}
