import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DatePicker} from '@ksf/sdk/date-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DatePickerStatusExample(){return <div className='ksf-demo-stack'><DatePicker label="warning" defaultValue="2026-11-18" status="warning"/><DatePicker label="error" defaultValue="2026-11-18" status="error"/></div>;}
