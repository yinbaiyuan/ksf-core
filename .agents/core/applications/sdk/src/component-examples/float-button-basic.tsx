import {useState,useRef} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {FloatButton,FloatButtonGroup} from '@ksf/sdk/float-button';
export function FloatButtonBasicExample(){const [message,setMessage]=useState('');return <div className='ksf-demo-stack'><div className='ksf-demo-row'><FloatButton floating={false} label='添加项目' onClick={()=>setMessage('已添加项目')}>＋</FloatButton><FloatButton floating={false} label='消息通知' badge={3} shape='square' description='通知' onClick={()=>setMessage('已查看通知')}>✉</FloatButton><FloatButton floating={false} label='主操作' variant='solid' tone='primary' onClick={()=>setMessage('已执行主操作')}>✓</FloatButton></div><output>{message||'悬浮按钮的基础形态'}</output></div>;}
