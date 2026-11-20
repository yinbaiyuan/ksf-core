import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TextArea} from '@ksf/sdk/text-area';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextAreaFocusExample(){const input=useRef<HTMLTextAreaElement>(null);return <div className='ksf-demo-stack'><TextArea ref={input} label='说明文字' defaultValue={'第一行说明\n第二行说明'}/><Button size='small' onClick={()=>{input.current?.focus();input.current?.select();}}>聚焦并全选</Button></div>;}
