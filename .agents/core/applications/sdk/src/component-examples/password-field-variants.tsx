import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {PasswordField} from '@ksf/sdk/password-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function PasswordFieldVariantsExample(){return <div className='ksf-demo-stack'>{(['outlined','filled','borderless','underlined'] as const).map(variant=><PasswordField key={variant} label={variant} variant={variant} placeholder='输入或选择内容'/>)}</div>;}
