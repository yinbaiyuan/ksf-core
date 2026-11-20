import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {RadioGroup} from '@ksf/sdk/radio-group';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function RadioGroupControlledExample(){const [value,setValue]=useState('read');return <div className='ksf-demo-stack'><RadioGroup label='受控访问级别' value={value} onValueChange={setValue} options={[{value:'read',label:'阅读'},{value:'edit',label:'编辑'},{value:'share',label:'分享'},{value:'locked',label:'审核',disabled:true}]}/><Button size='small' onClick={()=>setValue('edit')}>外部切换到编辑</Button><output>{value}</output></div>;}
