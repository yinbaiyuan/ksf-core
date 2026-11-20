import {useState} from 'react';
import {Calendar} from '@ksf/sdk/calendar';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CalendarBasicExample(){const [date,setDate]=useState('2026-11-18');return <div className='ksf-demo-stack'><Calendar value={date} onSelect={setDate}/><output>选中：{date}</output></div>;}
