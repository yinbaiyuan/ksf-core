import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {OTPInput} from '@ksf/sdk/otp-input';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function OtpInputSizesExample(){return <div className='ksf-demo-stack'>{(['small','medium','large'] as const).map(size=><OTPInput key={size} label={size+'尺寸'} size={size} length={4}/>)}</div>;}
