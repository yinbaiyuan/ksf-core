import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Combobox} from '@ksf/sdk/combobox';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ComboboxNativeFormExample(){const [message,setMessage]=useState('尚未提交');return <form className='ksf-demo-stack' onSubmit={event=>{event.preventDefault();setMessage(String(new FormData(event.currentTarget).get('content')??''));}}><Combobox label='表单内容' name='content' defaultValue={'示例内容'} options={[{value:'research',label:'研究资料'},{value:'delivery',label:'交付资料'},{value:'notes',label:'讨论纪要'}]} required/><div className='ksf-demo-row'><Button type='submit' tone='primary' variant='solid'>提交</Button><Button type='reset'>重置</Button></div><output>{message}</output></form>;}
