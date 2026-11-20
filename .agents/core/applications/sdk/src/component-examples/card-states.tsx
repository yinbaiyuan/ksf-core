import {useState} from 'react';
import {Card} from '@ksf/sdk/card';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CardStatesExample(){const [loading,setLoading]=useState(false),[action,setAction]=useState('选择卡片操作');return <div className='ksf-demo-stack'><Button onClick={()=>setLoading(v=>!v)}>切换加载状态</Button><Card size='small' title='交付方案' loading={loading} hoverable cover={<div className='ksf-demo-color-block'/>} actions={[<Button key='open' variant='text' size='small' onClick={()=>setAction('已打开交付方案')}>查看</Button>,<Button key='edit' variant='text' size='small' onClick={()=>setAction('进入编辑状态')}>编辑</Button>]}><p>封面、底部操作与紧凑卡片。</p></Card><output aria-live="polite">{action}</output><Card bordered={false}>无边框内容</Card></div>;}
