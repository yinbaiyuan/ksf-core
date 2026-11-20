import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ButtonGradientExample(){const [value,setValue]=useState('等待操作');return <div className='ksf-demo-stack'><Button variant='solid' tone='primary' style={{background:'linear-gradient(110deg,var(--ksf-color-primary),var(--ksf-color-info))',borderColor:'transparent'}} onClick={()=>setValue('渐变操作')}>渐变主操作</Button><output role='status'>{value}</output></div>;}
