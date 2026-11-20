import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {OTPInput} from '@ksf/sdk/otp-input';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function OtpInputLengthsExample(){return <div className='ksf-demo-stack'><OTPInput label='4位验证码' length={4}/><OTPInput label='6位验证码' length={6}/><OTPInput label='8位验证码' length={8}/></div>;}
