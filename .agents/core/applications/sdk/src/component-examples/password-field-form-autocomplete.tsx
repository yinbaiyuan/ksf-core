import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {PasswordField} from '@ksf/sdk/password-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PasswordFieldFormAutocompleteExample(){const [message,setMessage]=useState('');return <form className='ksf-demo-stack' onSubmit={event=>{event.preventDefault();setMessage('密码字段已由原生FormData提交（示例不显示密码）。');}}><PasswordField label='创建密码' name='password' autoComplete='new-password' minLength={6} required/><Button type='submit'>验证表单</Button><output>{message}</output></form>;}
