import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Pagination} from '@ksf/sdk/pagination';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PaginationDisabledExample(){return <div className='ksf-demo-stack'><Pagination total={120} disabled/><Pagination total={0} showSizeChanger/></div>;}
