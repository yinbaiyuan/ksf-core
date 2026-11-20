import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Upload,useUploadQueue} from '@ksf/sdk/upload';
import {Checkbox} from '@ksf/sdk/checkbox';
import {simulateUpload} from '@ksf/sdk/component-examples/upload-demo-transport';
export function UploadBasicExample(){const [fail,setFail]=useState(false),queue=useUploadQueue({autoStart:true,concurrency:2,transfer:(item,context)=>simulateUpload(item,context,fail)});return <div className='ksf-demo-stack'><p>模拟传输，不写入或发送文件；真实应用接入KSF文件服务或自有传输。</p><div className='ksf-demo-row'><Button onClick={()=>queue.add([new File(['example'],'示例资料-'+(queue.items.length+1)+'.txt',{type:'text/plain'})])}>添加内存示例</Button><Button disabled={!queue.items.length} onClick={queue.clear}>清空队列</Button></div><Upload queue={queue} maxFiles={5} maxSize={2*1024*1024}/></div>;}
