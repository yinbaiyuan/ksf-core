import {useState} from 'react';
import {DatePicker,DateRangePicker} from '@ksf/sdk/date-picker';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DatePickerBasicExample(){const [value,setValue]=useState('2026-11-18');return <div className='ksf-demo-stack'><DatePicker label='交付日期' value={value} onValueChange={setValue}/><output>{value||'未选择日期'}</output><DateRangePicker label='交付周期' defaultValue={['2026-11-18','2026-11-25']}/></div>;}
