import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ButtonCustomDisabledExample(){const [value,setValue]=useState('等待操作');return <div className='ksf-demo-stack'><Button disabled style={{background:'var(--ksf-color-warning-surface)',color:'var(--ksf-color-warning)',borderColor:'var(--ksf-color-warning)'}}>等待权限开通</Button><output role='status'>{value}</output></div>;}
