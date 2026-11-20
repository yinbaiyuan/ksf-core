import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Select} from '@ksf/sdk/select';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SelectVariantsExample(){return <div className='ksf-demo-stack'>{(['outlined','filled','borderless','underlined'] as const).map(variant=><Select key={variant} label={variant} variant={variant} options={[{value:'research',label:'研究资料'},{value:'delivery',label:'交付资料'},{value:'notes',label:'讨论纪要'}]} placeholder='输入或选择内容'/>)}</div>;}
