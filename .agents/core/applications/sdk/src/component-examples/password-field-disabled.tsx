import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {PasswordField} from '@ksf/sdk/password-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function PasswordFieldDisabledExample(){return <div className='ksf-demo-stack'><PasswordField label='不可用' disabled defaultValue={'示例内容'}/><PasswordField label='只读内容' readOnly defaultValue={'示例内容'}/></div>;}
