import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SearchField} from '@ksf/sdk/search-field';import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SearchFieldClearExample(){const [value,setValue]=useState('研究'),[result,setResult]=useState('');return <div className='ksf-demo-stack'><SearchField label='带筛选的搜索' prefix={<SearchGlyph/>} value={value} onValueChange={setValue} clearable onSearch={setResult}/><output>检索：{result||'未执行'}</output></div>;}
