import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ButtonVariantsExample(){const [value,setValue]=useState('等待操作');return <div className='ksf-demo-stack'><div className='ksf-demo-row'>{(['solid','outlined','dashed','soft','text'] as const).map(variant=><Button key={variant} variant={variant} tone={variant==='solid'?'primary':'neutral'} onClick={()=>setValue(variant)}>{variant}</Button>)}</div><output role='status'>{value}</output></div>;}
