import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {QRCode} from '@ksf/sdk/qr-code';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function QrCodeStatusesExample(){const [status,setStatus]=useState<'active'|'loading'|'expired'|'scanned'>('expired');return <div className='ksf-demo-stack'><QRCode value='ksf-demo' status={status} onRefresh={()=>setStatus('active')}/><div className='ksf-demo-row'>{(['active','loading','expired','scanned'] as const).map(s=><Button size='small' key={s} onClick={()=>setStatus(s)}>{s}</Button>)}</div></div>;}
