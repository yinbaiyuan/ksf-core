import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Space} from '@ksf/sdk/space';
import {TextField} from '@ksf/sdk/text-field';
import {Select} from '@ksf/sdk/select';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SpaceAlignExample(){const [align,setAlign]=useState('center');return <div className='ksf-demo-stack'><select aria-label='间距对齐' value={align} onChange={e=>setAlign(e.target.value)}>{['start','center','end','baseline'].map(v=><option key={v}>{v}</option>)}</select><Space align={align}><span>正文</span><DemoPanel style={{height:90}}>较高内容</DemoPanel><Button>按钮</Button></Space></div>;}
