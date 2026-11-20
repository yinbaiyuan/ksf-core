import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {OTPInput} from '@ksf/sdk/otp-input';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function OtpInputSeparatorsExample(){return <div className='ksf-demo-stack'><OTPInput label='分组验证码' length={6} separator={index=>index===2?'—':null}/><OTPInput label='逐项分隔' length={4} separator='·'/></div>;}
