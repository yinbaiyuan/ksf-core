import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TextArea} from '@ksf/sdk/text-area';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextAreaDisabledExample(){return <div className='ksf-demo-stack'><TextArea label='不可用' disabled defaultValue={'示例内容'}/><TextArea label='只读内容' readOnly defaultValue={'示例内容'}/></div>;}
