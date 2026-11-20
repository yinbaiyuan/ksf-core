import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TimePicker} from '@ksf/sdk/time-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TimePickerSecondsExample(){return <div className='ksf-demo-stack'><TimePicker label='精确到秒' seconds defaultValue='09:30:15'/><TimePicker label='十五分钟间隔' step={900} defaultValue='10:00'/></div>;}
