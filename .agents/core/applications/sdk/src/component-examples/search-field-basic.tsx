import {useState,useRef} from 'react';
import {SearchField} from '@ksf/sdk/search-field';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SearchFieldBasicExample(){const [result,setResult]=useState('尚未搜索');return <div className='ksf-demo-stack'><SearchField label='搜索组件' placeholder='输入关键词后按 Enter' clearable onSearch={v=>setResult(v?`搜索：${v}`:'全部组件')}/><output aria-live='polite'>{result}</output></div>;}
