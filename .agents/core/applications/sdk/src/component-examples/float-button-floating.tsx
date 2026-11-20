import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {FloatButton,FloatButtonGroup,BackToTop} from '@ksf/sdk/float-button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FloatButtonFloatingExample(){const [shown,setShown]=useState(false),[count,setCount]=useState(0);return <div className='ksf-demo-stack'><Button onClick={()=>setShown(v=>!v)}>{shown?'收起悬浮按钮':'显示窗口悬浮按钮'}</Button><output>操作 {count} 次</output>{shown&&<FloatButton label='窗口快速操作' bottom={24} inset={24} tone='primary' variant='solid' onClick={()=>setCount(count+1)}>＋</FloatButton>}</div>;}
