import {useState} from 'react';
import {Statistic} from '@ksf/sdk/statistic';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function StatisticStatesExample(){const [loading,setLoading]=useState(false);return <div className='ksf-demo-stack'><Statistic title='完成比例' value={78.25} precision={1} suffix='%' loading={loading}/><Button onClick={()=>setLoading(v=>!v)}>切换加载</Button><Statistic title='资料编号' value='KSF-20261118'/></div>;}
