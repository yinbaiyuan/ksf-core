import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Calendar} from '@ksf/sdk/calendar';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CalendarWeekstartExample(){return <Calendar defaultMonth='2026-11' defaultValue='2026-11-18' weekStart={0}/>;}
