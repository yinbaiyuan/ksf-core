import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {NumberField} from '@ksf/sdk/number-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function NumberFieldSizesExample(){return <div className='ksf-demo-stack'>{(['small','medium','large'] as const).map(size=><NumberField key={size} label={size+'尺寸'} size={size} placeholder='输入或选择内容'/>)}</div>;}
