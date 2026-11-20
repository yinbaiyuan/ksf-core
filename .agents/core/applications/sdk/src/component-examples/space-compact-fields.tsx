import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Space} from '@ksf/sdk/space';
import {TextField} from '@ksf/sdk/text-field';
import {Select} from '@ksf/sdk/select';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SpaceCompactFieldsExample(){const [value,setValue]=useState(''),[result,setResult]=useState('');return <div className='ksf-demo-stack'><Space compact wrap={false} align='stretch' style={{width:'100%'}}><TextField aria-label='资料关键词' placeholder='输入关键词' value={value} onValueChange={setValue} style={{minWidth:0}}/><Button variant='solid' tone='primary' onClick={()=>setResult(value)}>搜索</Button></Space><output>{result?`搜索：${result}`:'等待输入'}</output></div>;}
