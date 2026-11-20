import {useState,useRef} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {FloatButtonGroup,BackToTop} from '@ksf/sdk/float-button';
export function FloatButtonStatesExample(){const [message,setMessage]=useState(''),target=useRef<HTMLDivElement>(null);return <div className='ksf-demo-stack'><div className='ksf-demo-row'><FloatButtonGroup floating={false} menu label='展开工具操作' items={[{id:'help',label:'查看帮助',icon:'?',onClick:()=>setMessage('已打开帮助')},{id:'save',label:'保存资料',icon:'✓',onClick:()=>setMessage('已保存资料')}]}/><div ref={target} style={{height:140,overflow:'auto',border:'1px solid var(--ksf-color-border)',padding:12,flex:1}}><div style={{height:400}}>向下滚动，回顶按钮只控制这一区域。</div></div><BackToTop floating={false} target={target} threshold={40}/></div><output>{message}</output></div>;}
