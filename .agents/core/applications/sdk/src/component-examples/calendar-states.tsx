import {useState} from 'react';
import {Calendar} from '@ksf/sdk/calendar';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CalendarStatesExample(){return <Calendar label='交付工作日历' defaultValue='2026-11-18' min='2026-11-01' max='2026-11-30' disabledDate={date=>[0,6].includes(new Date(date+'T12:00:00Z').getUTCDay())} renderDate={date=>date==='2026-11-20'?<span>交付</span>:null}/>;}
