import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DatePicker} from '@ksf/sdk/date-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DatePickerDisabledExample(){return <div className='ksf-demo-stack'><DatePicker label="disabled" defaultValue="2026-11-18" disabled/><DatePicker label="readOnly" defaultValue="2026-11-18" readOnly/></div>;}
