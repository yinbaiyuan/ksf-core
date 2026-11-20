import {useState} from 'react';
import {QRCode} from '@ksf/sdk/qr-code';
import {Button} from '@ksf/sdk/button';
import {Card} from '@ksf/sdk/card';
import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function QRCodeStatesExample(){const [expired,setExpired]=useState(true);return <div className='ksf-demo-stack'><QRCode value='KSF 组件库首版' correction='H' status={expired?'expired':'active'} onRefresh={()=>setExpired(false)}/><Button onClick={()=>setExpired(true)}>模拟过期</Button><div className='ksf-demo-row'><QRCode value='KSF-DEMO' size={96} status='loading'/><QRCode value='KSF-DEMO' size={96} status='scanned'/></div></div>;}
