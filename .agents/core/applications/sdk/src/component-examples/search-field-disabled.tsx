import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SearchField} from '@ksf/sdk/search-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SearchFieldDisabledExample(){return <div className='ksf-demo-stack'><SearchField label='不可用' disabled defaultValue={'示例内容'}/><SearchField label='只读内容' readOnly defaultValue={'示例内容'}/></div>;}
