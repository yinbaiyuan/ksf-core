import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Combobox} from '@ksf/sdk/combobox';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ComboboxDisabledExample(){return <div className='ksf-demo-stack'><Combobox label='不可用' disabled defaultValue={'示例内容'} options={[{value:'research',label:'研究资料'},{value:'delivery',label:'交付资料'},{value:'notes',label:'讨论纪要'}]}/><Combobox label='只读内容' readOnly defaultValue={'示例内容'} options={[{value:'research',label:'研究资料'},{value:'delivery',label:'交付资料'},{value:'notes',label:'讨论纪要'}]}/></div>;}
