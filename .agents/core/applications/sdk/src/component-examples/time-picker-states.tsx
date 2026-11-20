import {useState} from 'react';
import {TimePicker} from '@ksf/sdk/time-picker';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TimePickerStatesExample(){return <form className='ksf-demo-stack'><TimePicker label='工作时段' min='09:00' max='18:00' step={900} defaultValue='10:00'/><TimePicker label='只读' readOnly defaultValue='12:00'/><TimePicker label='禁用' disabled/><Button type='reset'>还原时间</Button></form>;}
