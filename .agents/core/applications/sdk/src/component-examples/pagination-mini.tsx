import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Pagination} from '@ksf/sdk/pagination';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PaginationMiniExample(){return <div className='ksf-demo-stack'><Pagination total={200} size='small' showTotal={false}/><Pagination total={200} size='small' showSizeChanger/></div>;}
