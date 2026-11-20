import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {RadioGroup} from '@ksf/sdk/radio-group';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function RadioGroupFormExample(){const [message,setMessage]=useState('');return <form className='ksf-demo-stack' onSubmit={event=>{event.preventDefault();setMessage(String(new FormData(event.currentTarget).get('access')??''));}}><RadioGroup label='访问方式' name='access' defaultValue='read' options={[{value:'read',label:'阅读'},{value:'edit',label:'编辑'},{value:'share',label:'分享'},{value:'locked',label:'审核',disabled:true}]}/><div className='ksf-demo-row'><Button type='submit'>提交</Button><Button type='reset'>重置</Button></div><output>{message}</output></form>;}
