import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Upload,useUploadQueue} from '@ksf/sdk/upload';import {simulateUpload} from '@ksf/sdk/component-examples/upload-demo-transport';import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function UploadRetryExample(){const [fail,setFail]=useState(true),queue=useUploadQueue({transfer:(item,ctx)=>simulateUpload(item,ctx,fail)});return <div className='ksf-demo-stack'><Checkbox label='模拟传输失败' checked={fail} onCheckedChange={setFail}/><Button onClick={()=>queue.add([new File(['演示'],'可重试资料.txt')])}>添加测试资料</Button><Upload queue={queue}/><p>关闭失败开关后，点击失败条目的重试。</p></div>;}
