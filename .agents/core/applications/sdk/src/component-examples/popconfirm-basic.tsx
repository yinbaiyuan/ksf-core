import {useState} from 'react';
import {Popconfirm} from '@ksf/sdk/popconfirm';
import {Button} from '@ksf/sdk/button';
import {TextField} from '@ksf/sdk/text-field';
import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PopconfirmBasicExample(){const [removed,setRemoved]=useState(false);return <div className='ksf-demo-stack'>{removed?<Button onClick={()=>setRemoved(false)}>还原示例资料</Button>:<Popconfirm title='移除此资料？' description='本示例只移除当前预览中的条目。' confirmLabel='移除' danger onConfirm={()=>setRemoved(true)}><Button tone='danger'>移除资料</Button></Popconfirm>}<output>{removed?'资料已移除':'资料仍在'}</output></div>;}
