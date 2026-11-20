import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DatePicker} from '@ksf/sdk/date-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DatePickerFormExample(){const [result,setResult]=useState('');return <form onSubmit={e=>{e.preventDefault();setResult(String(new FormData(e.currentTarget).get('schedule')));}}><DatePicker label='安排' name='schedule' defaultValue='2026-11-18' required/><Button type='submit'>读取</Button><Button type='reset'>重置</Button><output>{result}</output></form>;}
