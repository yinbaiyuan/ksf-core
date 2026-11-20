import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {OTPInput} from '@ksf/sdk/otp-input';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function OtpInputMaskExample(){return <div className='ksf-demo-stack'><OTPInput label='密码样式验证码' mask/><OTPInput label='自定义遮蔽字符' length={4} mask='*'/></div>;}
