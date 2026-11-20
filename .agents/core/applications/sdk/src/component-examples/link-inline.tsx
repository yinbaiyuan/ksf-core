import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Link} from '@ksf/sdk/link';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function LinkInlineExample(){const [visited,setVisited]=useState('');return <p>阅读 <Link href='#guide' onClick={e=>{e.preventDefault();setVisited('使用说明');}}>使用说明</Link> 或 <Link href='#api' onClick={e=>{e.preventDefault();setVisited('API');}}>API</Link>。<output>{visited&&`已选择：${visited}`}</output></p>;}
