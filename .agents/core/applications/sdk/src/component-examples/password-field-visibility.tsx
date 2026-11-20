import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {PasswordField} from '@ksf/sdk/password-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PasswordFieldVisibilityExample(){return <div className='ksf-demo-stack'><PasswordField label='登录密码' defaultValue='ksf-example-password'/><PasswordField label='只读密码' defaultValue='read-only-demo' readOnly/></div>;}
