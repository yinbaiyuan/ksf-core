import {useState,useRef,useId} from 'react';
import {Pagination} from '@ksf/sdk/pagination';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PaginationStatesExample(){return <div className='ksf-demo-stack'><Pagination total={95} compact defaultPage={3}/><Pagination total={0}/><Pagination total={100} defaultPage={4} disabled/></div>;}
