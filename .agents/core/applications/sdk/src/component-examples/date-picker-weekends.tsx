import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DatePicker} from '@ksf/sdk/date-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DatePickerWeekendsExample(){return <DatePicker label='工作日' defaultValue='2026-11-18' disabledDate={d=>[0,6].includes(new Date(d+'T00:00:00Z').getUTCDay())}/>;}
