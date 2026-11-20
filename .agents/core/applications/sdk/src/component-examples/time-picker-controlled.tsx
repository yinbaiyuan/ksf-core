import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TimePicker} from '@ksf/sdk/time-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TimePickerControlledExample(){const [value,setValue]=useState('09:30');return <div className='ksf-demo-stack'><TimePicker label='受控选择' value={value} onValueChange={setValue}/><output>{value||'未选择'}</output><Button onClick={()=>setValue('')}>清空</Button></div>;}
