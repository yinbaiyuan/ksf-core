import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Combobox} from '@ksf/sdk/combobox';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ComboboxControlledExample(){const [value,setValue]=useState('示例内容');return <div className='ksf-demo-stack'><Combobox label='受控内容' value={value} onValueChange={setValue} options={[{value:'research',label:'研究资料'},{value:'delivery',label:'交付资料'},{value:'notes',label:'讨论纪要'}]}/><Button size='small' onClick={()=>setValue('从外部更新的内容')}>外部更新</Button><output>{value===null?'空值':value}</output></div>;}
