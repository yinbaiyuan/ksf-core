import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Upload,useUploadQueue} from '@ksf/sdk/upload';
import {Checkbox} from '@ksf/sdk/checkbox';
import {simulateUpload} from '@ksf/sdk/component-examples/upload-demo-transport';
export function UploadStatesExample(){const [fail,setFail]=useState(true),queue=useUploadQueue({autoStart:false,concurrency:2,transfer:(item,context)=>simulateUpload(item,context,fail)});return <div className='ksf-demo-stack'><p>模拟传输，不写入或发送文件；真实应用接入KSF文件服务或自有传输。</p><div className='ksf-demo-row'><Button onClick={()=>queue.add([new File(['example'],'示例资料-'+(queue.items.length+1)+'.txt',{type:'text/plain'})])}>添加内存示例</Button><Button onClick={()=>queue.start()}>开始待传队列</Button><Checkbox checked={fail} onCheckedChange={setFail}>模拟失败</Checkbox><Button disabled={!queue.items.length} onClick={queue.clear}>清空队列</Button></div><Upload queue={queue} drop maxFiles={5} maxSize={2*1024*1024}/></div>;}
