import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ButtonIconPlacementExample(){const [value,setValue]=useState('等待操作');return <div className='ksf-demo-stack'><div className='ksf-demo-row'><Button icon={<ArrowGlyph/>} iconPosition='start' onClick={()=>setValue('前置')}>前置图标</Button><Button icon={<ArrowGlyph/>} iconPosition='end' onClick={()=>setValue('后置')}>后置图标</Button></div><output role='status'>{value}</output></div>;}
