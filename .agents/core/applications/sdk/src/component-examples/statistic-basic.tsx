import {useState} from 'react';
import {Statistic} from '@ksf/sdk/statistic';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function StatisticBasicExample(){const [value,setValue]=useState(1280);return <div className='ksf-demo-stack'><Statistic title='本周完成资料' value={value} suffix='份'/><Button size='small' onClick={()=>setValue(v=>v+1)}>增加一份</Button><Statistic title='交付金额' value={6824.5} prefix='¥' precision={2}/></div>;}
