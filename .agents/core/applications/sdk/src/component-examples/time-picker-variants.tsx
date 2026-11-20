import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TimePicker} from '@ksf/sdk/time-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TimePickerVariantsExample(){return <div className='ksf-demo-stack'><TimePicker label="outlined" defaultValue="09:30" variant="outlined"/><TimePicker label="filled" defaultValue="09:30" variant="filled"/><TimePicker label="borderless" defaultValue="09:30" variant="borderless"/><TimePicker label="underlined" defaultValue="09:30" variant="underlined"/></div>;}
