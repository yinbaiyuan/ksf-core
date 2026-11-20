import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {FilePicker} from '@ksf/sdk/file-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FilePickerCustomExample(){const [cancel,setCancel]=useState(false);return <div className='ksf-demo-stack'><FilePicker label='选择应用资料' onPick={async()=>cancel?null:[{id:'app-file',name:'应用文件.txt',size:32}]} description='这里模拟应用提供的选择结果；真实应用可以接入 KSF 文件服务。'/><Button onClick={()=>setCancel(v=>!v)}>切换取消结果：{String(cancel)}</Button></div>;}
