import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Pagination} from '@ksf/sdk/pagination';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PaginationLabelsExample(){return <Pagination total={80} defaultPage={3} previousLabel='上一页' nextLabel='下一页' renderPage={(page,active)=><span>{active?'['+page+']':page}</span>} showTotal={false}/>;}
