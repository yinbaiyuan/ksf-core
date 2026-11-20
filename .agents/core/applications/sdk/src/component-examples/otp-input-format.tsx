import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {OTPInput} from '@ksf/sdk/otp-input';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function OtpInputFormatExample(){const [value,setValue]=useState('');return <div className='ksf-demo-stack'><OTPInput label='字母与数字口令' numeric={false} format={text=>text.replace(/[^a-z0-9]/gi,'').toUpperCase()} value={value} onValueChange={setValue}/><output>{value}</output></div>;}
