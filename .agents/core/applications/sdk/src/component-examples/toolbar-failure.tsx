import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Toolbar} from '@ksf/sdk/toolbar';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ToolbarFailureExample(){return <Toolbar label='失败示例工具栏' items={[{id:'retry',label:'执行失败示例',onAction:async()=>{throw Error('模拟操作失败，可重新尝试。');}},{id:'available',label:'其他操作',onAction:()=>{}}]}/>;}
