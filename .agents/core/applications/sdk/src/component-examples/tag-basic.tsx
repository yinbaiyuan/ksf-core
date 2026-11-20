import {useState} from 'react';
import {Tag} from '@ksf/sdk/tag';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TagBasicExample(){const [tags,setTags]=useState(['设计','开发','评审']);return <div className='ksf-demo-stack'><div className='ksf-demo-row'>{tags.map(tag=><Tag key={tag} tone='primary' onRemove={()=>setTags(v=>v.filter(x=>x!==tag))}>{tag}</Tag>)}</div><Button size='small' onClick={()=>setTags(['设计','开发','评审'])}>还原标签</Button><div className='ksf-demo-row'><Tag tone='success'>已完成</Tag><Tag tone='warning'>待确认</Tag><Tag tone='danger'>失败</Tag><Tag>普通标签</Tag></div></div>;}
