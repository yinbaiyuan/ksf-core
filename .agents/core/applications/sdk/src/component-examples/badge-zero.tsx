import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Badge} from '@ksf/sdk/badge';import {Avatar} from '@ksf/sdk/avatar';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function BadgeZeroExample(){return <div className='ksf-demo-row'><Badge count={0} showZero/><Badge count={120}/><Badge count={1000} max={999}/></div>;}
