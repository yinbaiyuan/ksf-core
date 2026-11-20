import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Calendar} from '@ksf/sdk/calendar';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CalendarEventsExample(){return <Calendar defaultMonth='2026-11' defaultValue='2026-11-18' renderDate={date=>['18','22'].includes(date.slice(-2))?<small style={{color:'var(--ksf-color-primary)'}}>● 评审</small>:null}/>;}
