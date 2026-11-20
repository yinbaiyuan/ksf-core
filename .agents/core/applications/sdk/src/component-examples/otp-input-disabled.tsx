import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {OTPInput} from '@ksf/sdk/otp-input';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function OtpInputDisabledExample(){return <div className='ksf-demo-stack'><OTPInput label='不可用验证码' defaultValue='1234' length={4} disabled/><OTPInput label='只读验证码' defaultValue='5678' length={4} readOnly/></div>;}
