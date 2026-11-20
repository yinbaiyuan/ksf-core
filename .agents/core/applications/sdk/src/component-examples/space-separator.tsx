import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Space} from '@ksf/sdk/space';
import {TextField} from '@ksf/sdk/text-field';
import {Select} from '@ksf/sdk/select';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SpaceSeparatorExample(){const [last,setLast]=useState('');return <div className='ksf-demo-stack'><Space separator={<span style={{color:'var(--ksf-color-border-strong)'}}>|</span>}>{['查看','编辑','归档'].map(v=><Button variant='text' size='small' key={v} onClick={()=>setLast(v)}>{v}</Button>)}</Space><output>{last}</output></div>;}
