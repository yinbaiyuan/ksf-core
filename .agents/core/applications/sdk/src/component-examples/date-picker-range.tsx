import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DateRangePicker} from '@ksf/sdk/date-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DatePickerRangeExample(){const [range,setRange]=useState<[string,string]>(['2026-11-18','2026-11-22']);return <div className='ksf-demo-stack'><DateRangePicker label='交付周期' value={range} onValueChange={setRange}/><output>{range.join(' 至 ')}</output></div>;}
