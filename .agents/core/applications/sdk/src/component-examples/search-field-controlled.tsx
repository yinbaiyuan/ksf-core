import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SearchField} from '@ksf/sdk/search-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SearchFieldControlledExample(){const [value,setValue]=useState('示例内容');return <div className='ksf-demo-stack'><SearchField label='受控内容' value={value} onValueChange={setValue}/><Button size='small' onClick={()=>setValue('从外部更新的内容')}>外部更新</Button><output>{value===null?'空值':value}</output></div>;}
