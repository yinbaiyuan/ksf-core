import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Masonry} from '@ksf/sdk/masonry';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';
import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function MasonryDynamicExample(){const [items,setItems]=useState([70,110,80,150,90]);return <div className='ksf-demo-stack'><div className='ksf-demo-row'><Button size='small' onClick={()=>setItems(old=>[...old,60+(old.length%4)*30])}>添加内容</Button><Button size='small' disabled={!items.length} onClick={()=>setItems(old=>old.slice(0,-1))}>移除末项</Button></div><Masonry columns={2} gap={12}>{items.map((height,i)=><DemoPanel key={i} emphasis={i%2===0} style={{height}}>内容{i+1}</DemoPanel>)}</Masonry></div>;}
