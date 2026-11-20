import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TimePicker} from '@ksf/sdk/time-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TimePickerSizesExample(){return <div className='ksf-demo-stack'><TimePicker label="small" defaultValue="09:30" size="small"/><TimePicker label="medium" defaultValue="09:30" size="medium"/><TimePicker label="large" defaultValue="09:30" size="large"/></div>;}
