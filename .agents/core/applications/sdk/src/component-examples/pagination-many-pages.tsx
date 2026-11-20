import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Pagination} from '@ksf/sdk/pagination';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PaginationManyPagesExample(){return <Pagination total={5000} defaultPage={25} showTotal={false}/>;}
