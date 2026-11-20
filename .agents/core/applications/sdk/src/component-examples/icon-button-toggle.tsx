import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {IconButton} from '@ksf/sdk/icon-button';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function IconButtonToggleExample(){const [selected,setSelected]=useState(false);return <div className='ksf-demo-row'><IconButton icon={CheckGlyph} label={selected?'取消勾选':'勾选项目'} aria-pressed={selected} variant={selected?'solid':'outlined'} tone={selected?'primary':'neutral'} onClick={()=>setSelected(v=>!v)}/><output>{selected?'已勾选':'未勾选'}</output></div>;}
