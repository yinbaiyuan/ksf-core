import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DatePicker} from '@ksf/sdk/date-picker';import {TimePicker} from '@ksf/sdk/time-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DatePickerDatetimeExample(){return <div className='ksf-demo-row'><DatePicker label='日期' defaultValue='2026-11-18'/><TimePicker label='时间' defaultValue='09:30'/></div>;}
