import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DatePicker} from '@ksf/sdk/date-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DatePickerBoundsExample(){return <DatePicker label='工作安排' min='2026-11-01' max='2026-11-30' defaultValue='2026-11-18'/>;}
