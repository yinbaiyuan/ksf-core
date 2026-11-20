import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {FloatButton,FloatButtonGroup,BackToTop} from '@ksf/sdk/float-button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FloatButtonBacktopExample(){const target=useRef<HTMLDivElement>(null);return <div className='ksf-demo-stack'><div ref={target} style={{height:180,overflow:'auto',border:'1px solid var(--ksf-color-border)'}}>{Array.from({length:20},(_,i)=><p key={i}>滚动内容 {i+1}</p>)}</div><BackToTop target={target} threshold={80} floating={false}/></div>;}
