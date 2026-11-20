import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Dropzone} from '@ksf/sdk/dropzone';
export function DropzoneStatesExample(){const [message,setMessage]=useState('');return <div className='ksf-demo-stack'><Dropzone accept='image/*' maxSize={2*1024*1024} maxFiles={2} paste onFiles={files=>setMessage(`已接受 ${files.map(f=>f.name).join('、')}`)} onReject={files=>setMessage(files.map(f=>`${f.file.name}：${f.message}`).join('；'))} description='接受图片，最多2个、单个2MB；可在区域聚焦时粘贴文件。'/><output role='status'>{message}</output></div>;}
