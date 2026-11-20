import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TextField} from '@ksf/sdk/text-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextFieldSizesDetailExample(){return <div className='ksf-demo-stack'>{(['small','medium','large'] as const).map(size=><TextField key={size} label={size+'尺寸'} size={size} placeholder='输入或选择内容'/>)}</div>;}
