import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {FilePicker} from '@ksf/sdk/file-picker';
export function FilePickerStatesExample(){const [disabled,setDisabled]=useState(false),[error,setError]=useState('');return <div className='ksf-demo-stack'><Button size='small' onClick={()=>setDisabled(v=>!v)}>{disabled?'启用':'禁用'}</Button><FilePicker accept='.txt,.md' maxSize={1024*1024} maxFiles={2} disabled={disabled} description='最多2个TXT或Markdown文件，每个不超过1MB。' onReject={files=>setError(files.map(f=>`${f.file.name}：${f.message}`).join('；'))}/><output role='status'>{error}</output></div>;}
