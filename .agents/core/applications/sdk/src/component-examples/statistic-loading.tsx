import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Statistic} from '@ksf/sdk/statistic';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function StatisticLoadingExample(){const [loading,setLoading]=useState(true);return <div className='ksf-demo-stack'><Statistic title='本轮完成' value={38} loading={loading}/><Button onClick={()=>setLoading(v=>!v)}>切换加载</Button></div>;}
