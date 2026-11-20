import {useState,useRef,useEffect} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Notification,useFeedback} from '@ksf/sdk/notification';
export function NotificationBasicExample(){const feedback=useFeedback();return <div className='ksf-demo-stack'><div className='ksf-demo-row'>{(['info','success','warning','error'] as const).map(tone=><Button key={tone} size='small' onClick={()=>feedback.show({heading:{info:'新的消息',success:'保存成功',warning:'请先检查',error:'操作失败'}[tone],tone,description:'详细说明、业务动作与当前窗口一起管理。'})}>{tone}</Button>)}</div><p>悬停或键盘聚焦会暂停计时；窗口失活时暂停。</p><Notification items={feedback.items} onDismiss={feedback.dismiss}/></div>;}
