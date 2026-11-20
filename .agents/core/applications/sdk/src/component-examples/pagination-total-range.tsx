import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Pagination} from '@ksf/sdk/pagination';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PaginationTotalRangeExample(){return <Pagination total={85} defaultPage={3} showTotal={({from,to,total})=>`${from}—${to} / 共${total}条`}/>;}
