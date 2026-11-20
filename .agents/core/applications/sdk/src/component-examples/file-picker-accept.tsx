import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {FilePicker} from '@ksf/sdk/file-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FilePickerAcceptExample(){const [items,setItems]=useState<readonly import('@ksf/sdk/file-picker').Attachment[]>([]),[error,setError]=useState('');return <div className='ksf-demo-stack'><FilePicker accept='.txt,.md' maxSize={1024*1024} maxFiles={3} items={items} onItemsChange={setItems} onReject={items=>setError(items.map(v=>v.file.name+'：'+v.message).join('、'))}/><output>已选 {items.length} 项 {error}</output></div>;}
