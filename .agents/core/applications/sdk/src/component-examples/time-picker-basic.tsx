import {useState} from 'react';
import {TimePicker} from '@ksf/sdk/time-picker';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TimePickerBasicExample(){const [value,setValue]=useState('09:30');return <div className='ksf-demo-stack'><TimePicker label='会议时间' value={value} onValueChange={setValue}/><output>{value||'尚未选择时间'}</output><TimePicker label='精确到秒' seconds defaultValue='09:30:15'/></div>;}
