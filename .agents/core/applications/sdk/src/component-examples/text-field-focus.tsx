import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TextField} from '@ksf/sdk/text-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextFieldFocusExample(){const input=useRef<HTMLInputElement>(null);return <div className='ksf-demo-stack'><TextField ref={input} label='焦点目标' defaultValue='通过原生ref选择内容'/><div className='ksf-demo-row'><Button size='small' onClick={()=>{input.current?.focus();input.current?.setSelectionRange(0,0);}}>光标到开头</Button><Button size='small' onClick={()=>{input.current?.focus();const n=input.current?.value.length??0;input.current?.setSelectionRange(n,n);}}>光标到末尾</Button><Button size='small' onClick={()=>{input.current?.focus();input.current?.select();}}>全选</Button></div></div>;}
