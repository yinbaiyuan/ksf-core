import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TimePicker} from '@ksf/sdk/time-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TimePickerBoundsExample(){return <TimePicker label='工作安排' min='09:00' max='18:00' defaultValue='09:30'/>;}
