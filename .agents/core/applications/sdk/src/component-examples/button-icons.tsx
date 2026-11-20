import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ButtonIconsExample(){const [value,setValue]=useState('等待操作');return <div className='ksf-demo-stack'><div className='ksf-demo-row'><Button icon={<SearchGlyph/>} tone='primary' variant='solid' onClick={()=>setValue('搜索')}>搜索</Button><Button icon={<SearchGlyph/>} aria-label='搜索图标' shape='circle' onClick={()=>setValue('圆形搜索')}/><Button icon={<CheckGlyph/>} shape='round' onClick={()=>setValue('已提交')}>提交</Button></div><output role='status'>{value}</output></div>;}
