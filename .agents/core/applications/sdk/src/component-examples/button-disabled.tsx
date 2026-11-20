import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ButtonDisabledExample(){const [value,setValue]=useState('等待操作');return <div className='ksf-demo-stack'><div className='ksf-demo-stack'><div className='ksf-demo-row'>{(['solid','outlined','dashed','soft','text'] as const).map(variant=><Button key={variant} variant={variant} tone='primary' disabled>不可用</Button>)}</div><span>禁用按钮不会激活回调或波纹。</span></div><output role='status'>{value}</output></div>;}
