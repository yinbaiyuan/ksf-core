import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TextField} from '@ksf/sdk/text-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextFieldDisabledExample(){return <div className='ksf-demo-stack'><TextField label='不可用' disabled defaultValue={'示例内容'}/><TextField label='只读内容' readOnly defaultValue={'示例内容'}/></div>;}
