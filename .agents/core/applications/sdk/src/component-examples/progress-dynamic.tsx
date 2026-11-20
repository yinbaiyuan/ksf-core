import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Progress} from '@ksf/sdk/progress';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ProgressDynamicExample(){const [value,setValue]=useState(40);return <div className='ksf-demo-stack'><Progress value={value}/><Progress value={value} variant='circle'/><div className='ksf-demo-row'><Button onClick={()=>setValue(Math.max(0,value-10))}>减少</Button><Button onClick={()=>setValue(Math.min(100,value+10))}>增加</Button></div></div>;}
