import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Switch} from '@ksf/sdk/switch';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SwitchControlledExample(){const [checked,setChecked]=useState(true);return <div className='ksf-demo-row'><Switch label='外部控制开关' checked={checked} onCheckedChange={setChecked}/><Button size='small' onClick={()=>setChecked(v=>!v)}>外部切换</Button></div>;}
