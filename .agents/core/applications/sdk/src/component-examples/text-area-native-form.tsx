import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TextArea} from '@ksf/sdk/text-area';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextAreaNativeFormExample(){const [message,setMessage]=useState('尚未提交');return <form className='ksf-demo-stack' onSubmit={event=>{event.preventDefault();setMessage(String(new FormData(event.currentTarget).get('content')??''));}}><TextArea label='表单内容' name='content' defaultValue={'示例内容'} required/><div className='ksf-demo-row'><Button type='submit' tone='primary' variant='solid'>提交</Button><Button type='reset'>重置</Button></div><output>{message}</output></form>;}
