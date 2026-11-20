import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {QRCode} from '@ksf/sdk/qr-code';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function QrCodeValueExample(){const [value,setValue]=useState('KSF 组件库');return <div className='ksf-demo-stack'><TextField label='二维码内容' value={value} onValueChange={setValue}/><QRCode value={value||' '}/></div>;}
