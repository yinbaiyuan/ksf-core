import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {FilePicker} from '@ksf/sdk/file-picker';
export function FilePickerBasicExample(){const [message,setMessage]=useState('');return <div className='ksf-demo-stack'><FilePicker multiple description='从本机选择文件；选择不会自动上传。' onReject={files=>setMessage(files.map(f=>f.message).join('；'))}/><output>{message}</output></div>;}
