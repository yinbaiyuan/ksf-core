import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Carousel} from '@ksf/sdk/carousel';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CarouselPositionsExample(){const [position,setPosition]=useState<'top'|'bottom'|'start'|'end'>('bottom');return <div className='ksf-demo-stack'><div className='ksf-demo-row'>{(['top','bottom','start','end'] as const).map(p=><Button size='small' key={p} onClick={()=>setPosition(p)}>{p}</Button>)}</div><Carousel slides={['方案概览','空间结构','细节说明'].map((text,i)=><DemoPanel key={text} style={{minHeight:160,justifyContent:'center',alignItems:'center',background:i%2?'var(--ksf-color-surface)':'var(--ksf-color-surface)'}}>{text}</DemoPanel>)} dotsPlacement={position}/></div>;}
