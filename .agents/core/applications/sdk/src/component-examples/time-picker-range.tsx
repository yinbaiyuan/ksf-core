import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TimePicker} from '@ksf/sdk/time-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TimePickerRangeExample(){const [start,setStart]=useState('09:00'),[end,setEnd]=useState('18:00');return <div className='ksf-demo-row'><TimePicker label='开始时间' value={start} max={end} onValueChange={setStart}/><TimePicker label='结束时间' value={end} min={start} onValueChange={setEnd}/></div>;}
