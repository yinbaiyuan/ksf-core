import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ScrollArea} from '@ksf/sdk/scroll-area';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ScrollAreaKeyboardExample(){return <div className='ksf-demo-stack'><p>Tab进入滚动区域后使用方向键、PageUp／PageDown滚动。</p><ScrollArea label='键盘滚动内容' style={{height:180,border:'1px solid var(--ksf-color-border)',padding:12}}>{Array.from({length:20},(_,i)=><p key={i}>第{i+1}段内容</p>)}</ScrollArea></div>;}
