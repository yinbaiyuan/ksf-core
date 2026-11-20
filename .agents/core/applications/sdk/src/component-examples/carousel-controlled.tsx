import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Carousel} from '@ksf/sdk/carousel';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CarouselControlledExample(){const [index,setIndex]=useState(0);return <div className='ksf-demo-stack'><Carousel slides={['方案概览','空间结构','细节说明'].map((text,i)=><DemoPanel key={text} style={{minHeight:160,justifyContent:'center',alignItems:'center',background:i%2?'var(--ksf-color-surface)':'var(--ksf-color-surface)'}}>{text}</DemoPanel>)} index={index} onIndexChange={setIndex}/><Button onClick={()=>setIndex((index+1)%3)}>外部切换：当前 {index+1}</Button></div>;}
