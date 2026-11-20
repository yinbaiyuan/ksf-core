import {useState,useRef} from 'react';
import {PasswordField} from '@ksf/sdk/password-field';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PasswordFieldBasicExample(){return <PasswordField label='登录密码' name='password' placeholder='请输入密码' description='点击末尾按钮切换可见性'/>;}
