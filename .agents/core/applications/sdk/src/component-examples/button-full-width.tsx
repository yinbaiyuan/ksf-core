import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ButtonFullWidthExample(){const [value,setValue]=useState('等待操作');return <div className='ksf-demo-stack'><div className='ksf-demo-stack'><Button fullWidth tone='primary' variant='solid' onClick={()=>setValue('开始')}>开始任务</Button><Button fullWidth variant='dashed' icon={<SearchGlyph/>} onClick={()=>setValue('添加')}>添加资料</Button></div><output role='status'>{value}</output></div>;}
