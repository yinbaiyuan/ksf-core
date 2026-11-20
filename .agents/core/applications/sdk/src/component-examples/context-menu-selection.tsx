import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ContextMenu} from '@ksf/sdk/context-menu';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ContextMenuSelectionExample(){const root=useRef<HTMLDivElement>(null),[selection,setSelection]=useState(''),[message,setMessage]=useState('');return <div className='ksf-demo-stack'><ContextMenu ref={root} label='可划词区域' style={{padding:20,border:'1px dashed var(--ksf-color-border-strong)'}} onContextMenu={()=>{const current=root.current?.ownerDocument.getSelection();setSelection(current?.anchorNode&&root.current?.contains(current.anchorNode)&&current.focusNode&&root.current?.contains(current.focusNode)?current.toString():'');}} items={[{id:'record',label:selection?'记录选中文字':'记录整段说明',onAction:()=>setMessage(selection||'整段说明')}]}>可以选择这段说明中的几个字，然后右键执行记录。选择范围限定在此区域。</ContextMenu><output>已记录：{message||'无'}</output></div>;}
