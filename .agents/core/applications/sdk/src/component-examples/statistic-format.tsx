import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Statistic} from '@ksf/sdk/statistic';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function StatisticFormatExample(){return <Statistic title='交付文件' value={1080} format={value=><span>{Number(value)/1000} 千份</span>}/>;}
