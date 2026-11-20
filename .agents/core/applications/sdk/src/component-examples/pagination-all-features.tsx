import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Pagination} from '@ksf/sdk/pagination';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PaginationAllFeaturesExample(){return <Pagination total={500} defaultPage={6} showSizeChanger showQuickJumper showTotal={({from,to,total})=>`${from}—${to} / ${total}`}/>;}
