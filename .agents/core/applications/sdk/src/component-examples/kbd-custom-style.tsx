import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Kbd} from '@ksf/sdk/kbd';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function KbdCustomStyleExample(){return <div className='ksf-demo-row'><Kbd style={{fontSize:18,padding:'6px 10px'}}>⌘</Kbd><Kbd style={{color:'var(--ksf-color-primary)',borderColor:'var(--ksf-color-primary)'}}>K</Kbd><Kbd aria-label='向上箭头'>↑</Kbd><Kbd aria-label='向下箭头'>↓</Kbd></div>;}
