import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {NumberField} from '@ksf/sdk/number-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function NumberFieldDisabledExample(){return <div className='ksf-demo-stack'><NumberField label='不可用' disabled defaultValue={24}/><NumberField label='只读内容' readOnly defaultValue={24}/></div>;}
