import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {FloatButton,FloatButtonGroup,BackToTop} from '@ksf/sdk/float-button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FloatButtonMenuExample(){const [action,setAction]=useState('');return <div className='ksf-demo-row'><FloatButtonGroup floating={false} menu items={[{id:'add',label:'新增',icon:'＋',onClick:()=>setAction('新增')},{id:'help',label:'帮助',icon:'?',onClick:()=>setAction('帮助')}]}/><output>{action}</output></div>;}
