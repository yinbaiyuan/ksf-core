import {useState,useRef} from 'react';
import {OTPInput} from '@ksf/sdk/otp-input';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function OTPInputBasicExample(){const [result,setResult]=useState('等待填写');return <div className='ksf-demo-stack'><OTPInput label='六位验证码' length={6} onComplete={v=>setResult(`已完成：${v}`)}/><output aria-live='polite'>{result}</output></div>;}
