import {useState,useRef,useEffect} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Result} from '@ksf/sdk/result';
export function ResultBasicExample(){const [done,setDone]=useState(false);return <Result status='success' heading={done?'操作完成':'提交成功'} description='结果已记录，可以继续下一步。' actions={<Button onClick={()=>setDone(true)}>完成</Button>}/>;}
