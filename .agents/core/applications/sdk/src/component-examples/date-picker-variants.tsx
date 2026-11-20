import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DatePicker} from '@ksf/sdk/date-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DatePickerVariantsExample(){return <div className='ksf-demo-stack'><DatePicker label="outlined" defaultValue="2026-11-18" variant="outlined"/><DatePicker label="filled" defaultValue="2026-11-18" variant="filled"/><DatePicker label="borderless" defaultValue="2026-11-18" variant="borderless"/><DatePicker label="underlined" defaultValue="2026-11-18" variant="underlined"/></div>;}
