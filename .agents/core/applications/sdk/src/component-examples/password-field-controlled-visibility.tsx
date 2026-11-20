import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {PasswordField} from '@ksf/sdk/password-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PasswordFieldControlledVisibilityExample(){const [visible,setVisible]=useState(false);return <div className='ksf-demo-stack'><PasswordField label='受控显隐密码' visible={visible} onVisibleChange={setVisible} defaultValue='example-password'/><Button size='small' onClick={()=>setVisible(v=>!v)}>{visible?'隐藏密码':'显示密码'}</Button></div>;}
