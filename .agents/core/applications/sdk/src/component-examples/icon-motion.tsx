import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Icon} from '@ksf/sdk/icon';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function IconMotionExample(){const [spin,setSpin]=useState(true),[rotate,setRotate]=useState(0);return <div className='ksf-demo-stack'><div className='ksf-demo-row'><Icon icon={ArrowGlyph} spin={spin} size={32} label='旋转动画'/><Icon icon={ArrowGlyph} rotate={rotate} size={32} label='静态旋转'/></div><div className='ksf-demo-row'><Button onClick={()=>setSpin(v=>!v)}>{spin?'停止旋转':'开启动画'}</Button><Button onClick={()=>setRotate(v=>v+45)}>旋转45度</Button></div></div>;}
