import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Link} from '@ksf/sdk/link';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function LinkIconExample(){const [count,setCount]=useState(0);return <div className='ksf-demo-row'><Link href='#search' onClick={e=>{e.preventDefault();setCount(v=>v+1);}}><SearchGlyph/> 搜索文档</Link><Link href='#next' onClick={e=>{e.preventDefault();setCount(v=>v+1);}}>继续阅读 <ArrowGlyph/></Link><output>{count}次</output></div>;}
