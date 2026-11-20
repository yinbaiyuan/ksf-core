import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TimePicker} from '@ksf/sdk/time-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TimePickerFormExample(){const [result,setResult]=useState('');return <form onSubmit={e=>{e.preventDefault();setResult(String(new FormData(e.currentTarget).get('schedule')));}}><TimePicker label='安排' name='schedule' defaultValue='09:30' required/><Button type='submit'>读取</Button><Button type='reset'>重置</Button><output>{result}</output></form>;}
