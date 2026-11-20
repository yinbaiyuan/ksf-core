import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Statistic} from '@ksf/sdk/statistic';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function StatisticPrecisionExample(){return <div className='ksf-demo-row'><Statistic title='累计金额' value={12345.678} precision={2}/><Statistic title='完成比例' value={88.5} precision={1} suffix='%'/></div>;}
