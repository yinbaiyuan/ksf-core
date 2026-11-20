import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Calendar} from '@ksf/sdk/calendar';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CalendarControlledExample(){const [value,setValue]=useState('2026-11-18'),[month,setMonth]=useState('2026-11');return <div className='ksf-demo-stack'><Calendar value={value} onSelect={setValue} month={month} onMonthChange={setMonth}/><output>{month} / {value}</output><Button onClick={()=>setMonth('2026-12')}>切换到十二月</Button></div>;}
