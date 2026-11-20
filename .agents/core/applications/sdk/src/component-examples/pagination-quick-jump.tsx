import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Pagination} from '@ksf/sdk/pagination';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PaginationQuickJumpExample(){const [page,setPage]=useState(2);return <div className='ksf-demo-stack'><Pagination total={500} page={page} onPageChange={setPage} showQuickJumper/><output>输入页码后按Enter；当前第{page}页</output></div>;}
