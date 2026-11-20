import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SearchField} from '@ksf/sdk/search-field';import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SearchFieldActionTextExample(){const [result,setResult]=useState('');return <div className='ksf-demo-stack'><SearchField label='资料搜索' searchAction='搜索' onSearch={setResult} placeholder='输入关键词并按Enter'/><output>关键词：{result||'无'}</output></div>;}
