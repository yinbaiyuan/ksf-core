import {useState,useRef,useId} from 'react';
import {Anchor} from '@ksf/sdk/anchor';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AnchorBasicExample(){const root=useRef<HTMLDivElement>(null),uid=useId();const items=[{id:uid+'-intro',label:'项目说明'},{id:uid+'-process',label:'工作过程'},{id:uid+'-delivery',label:'交付清单'}];return <div className='ksf-demo-stack'><Anchor container={root} items={items}/><div ref={root} style={{height:220,overflow:'auto',border:'1px solid var(--ksf-color-border)',padding:12}}>{items.map(item=><section key={item.id} id={item.id} style={{minHeight:180}}><h3>{item.label}</h3><p>点击导航仅滚动当前资料区域。</p></section>)}</div></div>;}
