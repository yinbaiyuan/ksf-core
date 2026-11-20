import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DatePicker} from '@ksf/sdk/date-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DatePickerSizesExample(){return <div className='ksf-demo-stack'><DatePicker label="small" defaultValue="2026-11-18" size="small"/><DatePicker label="medium" defaultValue="2026-11-18" size="medium"/><DatePicker label="large" defaultValue="2026-11-18" size="large"/></div>;}
