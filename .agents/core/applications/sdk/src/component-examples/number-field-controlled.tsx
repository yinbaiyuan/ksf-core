import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {NumberField} from '@ksf/sdk/number-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function NumberFieldControlledExample(){const [value,setValue]=useState<number|null>(24);return <div className='ksf-demo-stack'><NumberField label='受控内容' value={value} onValueChange={setValue}/><Button size='small' onClick={()=>setValue(68)}>外部更新</Button><output>{value===null?'空值':value}</output></div>;}
