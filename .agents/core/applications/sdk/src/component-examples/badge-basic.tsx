import {useState} from 'react';
import {Badge} from '@ksf/sdk/badge';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function BadgeBasicExample(){const [count,setCount]=useState(5);return <div className='ksf-demo-stack'><div className='ksf-demo-row'><Badge count={count} label={`${count}条待办`}><Button>待办</Button></Badge><Button size='small' onClick={()=>setCount(v=>v+1)}>增加</Button><Button size='small' onClick={()=>setCount(0)}>清零</Button></div><div className='ksf-demo-row'><Badge count={120}/><Badge count={0} showZero/><Badge dot tone='success' text='在线'/></div></div>;}
