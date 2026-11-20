import {useState,useRef,useEffect} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Progress} from '@ksf/sdk/progress';
export function ProgressStatesExample(){const [value,setValue]=useState(35);return <div className='ksf-demo-stack'><div className='ksf-demo-row'><Progress variant='circle' value={value} size={100}/><Progress variant='dashboard' value={value} size={100}/></div><div className='ksf-demo-row'><Button size='small' disabled={value<=0} onClick={()=>setValue(v=>Math.max(0,v-10))}>减10</Button><Button size='small' disabled={value>=100} onClick={()=>setValue(v=>Math.min(100,v+10))}>加10</Button></div><Progress value={value} format={v=>`${v} / 100 个文件`}/></div>;}
