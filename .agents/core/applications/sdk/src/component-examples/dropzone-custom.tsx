import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Dropzone} from '@ksf/sdk/dropzone';import {Progress} from '@ksf/sdk/progress';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DropzoneCustomExample(){const [count,setCount]=useState(0);return <Dropzone onFiles={files=>setCount(count+files.length)} description='拖入文件或点击选择'><p>已接收 {count} 份资料</p><Progress value={Math.min(100,count*20)} label='接收目标'/></Dropzone>;}
