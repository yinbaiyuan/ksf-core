import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ScrollArea} from '@ksf/sdk/scroll-area';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ScrollAreaProgrammaticExample(){const area=useRef<HTMLDivElement>(null);return <div className='ksf-demo-stack'><div className='ksf-demo-row'><Button size='small' onClick={()=>area.current?.scrollTo({top:0})}>回到顶部</Button><Button size='small' onClick={()=>area.current?.scrollTo({top:area.current.scrollHeight})}>移到底部</Button></div><ScrollArea ref={area} label='可定位内容' style={{height:160,border:'1px solid var(--ksf-color-border)',padding:12}}>{Array.from({length:20},(_,i)=><p key={i}>条目{i+1}</p>)}</ScrollArea></div>;}
