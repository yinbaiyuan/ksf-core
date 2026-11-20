import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DatePicker} from '@ksf/sdk/date-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DatePickerControlledExample(){const [value,setValue]=useState('2026-11-18');return <div className='ksf-demo-stack'><DatePicker label='受控选择' value={value} onValueChange={setValue}/><output>{value||'未选择'}</output><Button onClick={()=>setValue('')}>清空</Button></div>;}
