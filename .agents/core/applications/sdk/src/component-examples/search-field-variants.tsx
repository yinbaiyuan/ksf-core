import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SearchField} from '@ksf/sdk/search-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SearchFieldVariantsExample(){return <div className='ksf-demo-stack'>{(['outlined','filled','borderless','underlined'] as const).map(variant=><SearchField key={variant} label={variant} variant={variant} placeholder='输入或选择内容'/>)}</div>;}
