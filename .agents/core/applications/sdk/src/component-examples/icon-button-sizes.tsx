import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {IconButton} from '@ksf/sdk/icon-button';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function IconButtonSizesExample(){const [value,setValue]=useState(0);return <div className='ksf-demo-stack'><div className='ksf-demo-row'>{(['small','medium','large'] as const).map(size=><IconButton key={size} size={size} icon={SearchGlyph} label={`搜索${size}`} onClick={()=>setValue(v=>v+1)}/>)}</div><output>{value}次操作</output></div>;}
