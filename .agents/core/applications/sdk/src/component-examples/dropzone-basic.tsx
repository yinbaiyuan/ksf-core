import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Dropzone} from '@ksf/sdk/dropzone';
export function DropzoneBasicExample(){const [names,setNames]=useState<string[]>([]);return <div className='ksf-demo-stack'><Dropzone multiple onFiles={files=>setNames(files.map(f=>f.name))} description='拖入文件或点击按钮；只接收文件，不处理传输。'/><output>{names.join('、')||'尚未接收文件'}</output></div>;}
