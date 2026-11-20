import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ButtonGhostExample(){const [value,setValue]=useState('等待操作');return <div className='ksf-demo-stack'><DemoPanel emphasis style={{padding:24}}><div className='ksf-demo-row'><Button ghost onClick={()=>setValue('透明')}>透明按钮</Button><Button ghost tone='primary' onClick={()=>setValue('主操作透明')}>主操作</Button><Button ghost tone='danger' onClick={()=>setValue('危险透明')}>危险操作</Button><Button ghost disabled>不可用</Button></div></DemoPanel><output role='status'>{value}</output></div>;}
