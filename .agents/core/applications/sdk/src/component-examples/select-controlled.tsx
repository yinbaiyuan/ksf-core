import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Select} from '@ksf/sdk/select';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SelectControlledExample(){const [value,setValue]=useState('research');return <div className='ksf-demo-stack'><Select label='受控内容' value={value} onValueChange={setValue} options={[{value:'research',label:'研究资料'},{value:'delivery',label:'交付资料'},{value:'notes',label:'讨论纪要'}]}/><Button size='small' onClick={()=>setValue('delivery')}>外部更新</Button><output>{value===null?'空值':value}</output></div>;}
