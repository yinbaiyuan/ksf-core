import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TextField} from '@ksf/sdk/text-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextFieldVariantsExample(){return <div className='ksf-demo-stack'>{(['outlined','filled','borderless','underlined'] as const).map(variant=><TextField key={variant} label={variant} variant={variant} placeholder='输入或选择内容'/>)}</div>;}
