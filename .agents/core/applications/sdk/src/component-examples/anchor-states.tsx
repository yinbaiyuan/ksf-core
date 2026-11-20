import {useState,useRef,useId} from 'react';
import {Anchor} from '@ksf/sdk/anchor';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AnchorStatesExample(){const root=useRef<HTMLDivElement>(null),uid=useId();return <div className='ksf-demo-stack'><Anchor label='独立区域导航' container={root} items={[{id:uid,label:'范围内目标'}]} offset={16}/><div ref={root} style={{height:120,overflow:'auto'}}><div style={{height:150}}>向下查看目标</div><h3 id={uid}>范围内目标</h3><div style={{height:150}}/></div></div>;}
