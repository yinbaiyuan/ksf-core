import {useState,useRef,useEffect} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {EmptyState} from '@ksf/sdk/empty-state';
export function EmptyStateStatesExample(){const [created,setCreated]=useState(false);return created?<div className='ksf-demo-stack'><p role='status'>已创建示例项目</p><Button onClick={()=>setCreated(false)}>重置</Button></div>:<EmptyState heading='还没有项目' description='创建第一个项目后，内容会出现在这里。' actions={<Button variant='solid' tone='primary' onClick={()=>setCreated(true)}>创建项目</Button>}/>;}
