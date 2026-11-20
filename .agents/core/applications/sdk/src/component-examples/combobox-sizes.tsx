import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Combobox} from '@ksf/sdk/combobox';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ComboboxSizesExample(){return <div className='ksf-demo-stack'>{(['small','medium','large'] as const).map(size=><Combobox key={size} label={size+'尺寸'} size={size} options={[{value:'research',label:'研究资料'},{value:'delivery',label:'交付资料'},{value:'notes',label:'讨论纪要'}]} placeholder='输入或选择内容'/>)}</div>;}
