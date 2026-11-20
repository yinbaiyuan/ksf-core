import {useState,useRef} from 'react';
import {OTPInput} from '@ksf/sdk/otp-input';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function OTPInputStatesExample(){return <form className='ksf-demo-stack'><OTPInput label='四位密文' name='pin' length={4} mask/><OTPInput label='不可输入' disabled length={4}/><Button type='reset'>清空验证码</Button></form>;}
