import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Statistic} from '@ksf/sdk/statistic';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function StatisticPrefixExample(){return <div className='ksf-demo-row'><Statistic title='今日增量' value={12.8} prefix='↑' suffix='%' style={{color:'var(--ksf-color-success)'}}/><Statistic title='预算' value={6500} prefix='¥'/></div>;}
