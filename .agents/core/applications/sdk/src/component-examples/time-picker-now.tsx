import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TimePicker} from '@ksf/sdk/time-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TimePickerNowExample(){const [value,setValue]=useState('09:30');return <div className='ksf-demo-stack'><TimePicker label='提醒' value={value} onValueChange={setValue}/><Button onClick={()=>{const d=new Date();setValue(String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'));}}>设为当前时间</Button></div>;}
