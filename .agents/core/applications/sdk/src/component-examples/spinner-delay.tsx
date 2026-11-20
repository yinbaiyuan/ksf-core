import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Spinner} from '@ksf/sdk/spinner';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SpinnerDelayExample(){const [spinning,setSpinning]=useState(false);return <div className='ksf-demo-stack'><Button onClick={()=>setSpinning(v=>!v)}>切换加载</Button><Spinner spinning={spinning} delay={500} label='延迟500ms显示'><DemoPanel>底层内容</DemoPanel></Spinner></div>;}
