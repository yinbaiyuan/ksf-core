import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ButtonRootStyleExample(){const [value,setValue]=useState('等待操作');return <div className='ksf-demo-stack'><Button icon={<CheckGlyph/>} style={{borderRadius:16,minHeight:44,boxShadow:'0 4px 16px var(--ksf-color-scrim)'}} onClick={()=>setValue('自定义样式')}>自定义形态</Button><output role='status'>{value}</output></div>;}
