import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {OTPInput} from '@ksf/sdk/otp-input';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function OtpInputCompleteExample(){const [value,setValue]=useState(''),[complete,setComplete]=useState('未完成');return <div className='ksf-demo-stack'><OTPInput label='完成反馈' value={value} onValueChange={setValue} onComplete={text=>setComplete('已完成：'+text)}/><Button size='small' onClick={()=>{setValue('');setComplete('已重置');}}>清空验证码</Button><output>{complete}</output></div>;}
