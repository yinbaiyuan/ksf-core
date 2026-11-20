import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TextArea} from '@ksf/sdk/text-area';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextAreaSizesExample(){return <div className='ksf-demo-stack'>{(['small','medium','large'] as const).map(size=><TextArea key={size} label={size+'尺寸'} size={size} placeholder='输入或选择内容'/>)}</div>;}
