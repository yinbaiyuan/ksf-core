import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Upload,useUploadQueue} from '@ksf/sdk/upload';import {simulateUpload} from '@ksf/sdk/component-examples/upload-demo-transport';import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function UploadCircleExample(){const queue=useUploadQueue({autoStart:true,concurrency:2,transfer:simulateUpload}),[error,setError]=useState('');return <div className='ksf-demo-stack'><p>模拟传输，不向外发送文件。</p><Upload queue={queue} layout='picture-circle' accept='image/*' onReject={items=>setError(items.map(v=>v.file.name+'：'+v.message).join('、'))}/><div className='ksf-demo-row'><Button onClick={()=>queue.add([{id:'picture-'+Date.now(),name:'空间方案.svg',type:'image/svg+xml',thumbnail:mediaSamples[0].src,url:mediaSamples[0].src}])}>添加内存资料</Button><Button onClick={queue.clear}>清空并取消</Button></div><output>{error}</output></div>;}
