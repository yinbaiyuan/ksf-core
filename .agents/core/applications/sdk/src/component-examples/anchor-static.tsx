import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Anchor} from '@ksf/sdk/anchor';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function AnchorStaticExample(){const container=useRef<HTMLDivElement>(null),prefix=useId(),[message,setMessage]=useState('');const items=['概述','实施','结果'].map((label,i)=>({id:prefix+'-'+i,label}));return <div className='ksf-demo-stack'><Anchor orientation='vertical' container={container} offset={0} items={items}/><div ref={container} style={{height:220,overflow:'auto',border:'1px solid var(--ksf-color-border)',padding:12}}>{items.map((item,i)=><section key={item.id} id={item.id} style={{minHeight:180,paddingTop:8}}><h3>{item.label}</h3><p>当前窗口内的第{i+1}段内容。</p><DemoPanel emphasis>滚动或点击上方导航定位</DemoPanel></section>)}</div></div>;}
