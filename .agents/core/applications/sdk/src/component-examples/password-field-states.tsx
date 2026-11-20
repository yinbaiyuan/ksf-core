import {useState,useRef} from 'react';
import {PasswordField} from '@ksf/sdk/password-field';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PasswordFieldStatesExample(){return <div className='ksf-demo-stack'><PasswordField label='新密码' autoComplete='new-password' error='至少 8 个字符' minLength={8}/><PasswordField label='只读密码' defaultValue='ksf-demo' readOnly/><PasswordField label='禁用密码' disabled/></div>;}
