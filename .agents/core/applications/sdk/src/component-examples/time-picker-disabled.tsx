import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TimePicker} from '@ksf/sdk/time-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TimePickerDisabledExample(){return <div className='ksf-demo-stack'><TimePicker label="disabled" defaultValue="09:30" disabled/><TimePicker label="readOnly" defaultValue="09:30" readOnly/></div>;}
