import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {AttachmentList} from '@ksf/sdk/attachment-list';
export function AttachmentListBasicExample(){const [items,setItems]=useState([{id:'one',name:'项目资料.pdf',size:204800,status:'done' as const},{id:'two',name:'讨论纪要.md',size:1800,status:'done' as const}]),[message,setMessage]=useState('');return <div className='ksf-demo-stack'><AttachmentList items={items} onRemove={id=>setItems(old=>old.filter(item=>item.id!==id))} onPreview={item=>setMessage(`预览请求：${item.name}（由应用接入）`)}/><output>{message}</output></div>;}
