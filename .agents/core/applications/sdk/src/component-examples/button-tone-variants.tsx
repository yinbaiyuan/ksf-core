import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ButtonToneVariantsExample(){const [value,setValue]=useState('等待操作');return <div className='ksf-demo-stack'><div className='ksf-demo-stack'>{(['neutral','primary','danger'] as const).map(tone=><div className='ksf-demo-row' key={tone}>{(['solid','outlined','soft','text','dashed'] as const).map(variant=><Button key={variant} tone={tone} variant={variant} size='small' onClick={()=>setValue(tone+' / '+variant)}>{tone}</Button>)}</div>)}</div><output role='status'>{value}</output></div>;}
