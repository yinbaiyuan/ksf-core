import {useState} from 'react';
import {DatePicker,DateRangePicker} from '@ksf/sdk/date-picker';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DatePickerStatesExample(){return <form className='ksf-demo-stack'><DatePicker label='本月工作日' min='2026-11-01' max='2026-11-30' defaultValue='2026-11-18' disabledDate={date=>[0,6].includes(new Date(date+'T12:00:00Z').getUTCDay())}/><DatePicker label='只读日期' defaultValue='2026-11-18' readOnly/><DatePicker label='禁用日期' disabled/><Button type='reset'>还原日期</Button></form>;}
