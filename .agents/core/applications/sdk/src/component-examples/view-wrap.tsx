import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {View} from '@ksf/sdk/view';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ViewWrapExample(){const [wrap,setWrap]=useState(true);return <div className='ksf-demo-stack'><Button size='small' onClick={()=>setWrap(v=>!v)}>{wrap?'关闭换行':'开启换行'}</Button><View direction='row' wrap={wrap} gap={8} style={{maxWidth:320,overflow:'auto'}}>{Array.from({length:8},(_,i)=><DemoPanel emphasis key={i} style={{width:86,flexShrink:0}}>项目{i+1}</DemoPanel>)}</View></div>;}
