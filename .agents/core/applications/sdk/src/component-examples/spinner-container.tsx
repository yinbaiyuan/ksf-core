import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Spinner} from '@ksf/sdk/spinner';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SpinnerContainerExample(){const [spinning,setSpinning]=useState(true);return <div className='ksf-demo-stack'><Button onClick={()=>setSpinning(v=>!v)}>切换加载</Button><Spinner spinning={spinning} block><DemoPanel><Button>加载期间禁用的内容</Button></DemoPanel></Spinner></div>;}
