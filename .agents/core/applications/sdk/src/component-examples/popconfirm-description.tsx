import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Popconfirm} from '@ksf/sdk/popconfirm';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PopconfirmDescriptionExample(){const [count,setCount]=useState(0);return <div className='ksf-demo-row'><Popconfirm title='确认操作？' description='移除当前演示项，不影响真实文件。' onConfirm={()=>{setCount(count+1);}}><Button>执行操作</Button></Popconfirm><output>确认 {count} 次</output></div>;}
