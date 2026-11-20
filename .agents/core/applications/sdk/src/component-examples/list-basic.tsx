import {useState} from 'react';
import {List} from '@ksf/sdk/list';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ListBasicExample(){const [selected,setSelected]=useState('尚未查看');const items=[{id:'a',group:'进行中',title:'空间方案'},{id:'b',group:'进行中',title:'设备研究'},{id:'c',group:'已完成',title:'访谈纪要'}];return <div className='ksf-demo-stack'><List label='项目资料' items={items} getId={item=>item.id} groupBy={item=>item.group} stickyHeaders height={210} renderItem={item=><div className='ksf-demo-row'><span style={{flex:1}}>{item.title}</span><Button size='small' variant='text' onClick={()=>setSelected(`正在查看：${item.title}`)}>查看</Button></div>}/><output aria-live='polite'>{selected}</output></div>;}
