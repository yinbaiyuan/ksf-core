import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Dropzone} from '@ksf/sdk/dropzone';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DropzoneRulesExample(){const [names,setNames]=useState<string[]>([]),[error,setError]=useState('');return <div className='ksf-demo-stack'><Dropzone accept='image/*' maxSize={2*1024*1024} maxFiles={2} onFiles={files=>setNames(files.map(f=>f.name))} onReject={files=>setError(files.map(f=>f.file.name+'：'+f.message).join('、'))} description='仅接收本机文件，不发送。'/><output>{names.join('、')} {error}</output></div>;}
