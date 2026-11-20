import {useState} from 'react';
import {Card} from '@ksf/sdk/card';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CardBasicExample(){const [count,setCount]=useState(0);return <Card title='项目资料' description='本周工作空间' extra={<Button size='small' variant='text' onClick={()=>setCount(v=>v+1)}>刷新</Button>} footer={`已刷新 ${count} 次`}><p>按内容主题组织摘要、操作和附加说明。</p></Card>;}
