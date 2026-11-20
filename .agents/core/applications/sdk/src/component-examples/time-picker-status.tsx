import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TimePicker} from '@ksf/sdk/time-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TimePickerStatusExample(){return <div className='ksf-demo-stack'><TimePicker label="warning" defaultValue="09:30" status="warning"/><TimePicker label="error" defaultValue="09:30" status="error"/></div>;}
