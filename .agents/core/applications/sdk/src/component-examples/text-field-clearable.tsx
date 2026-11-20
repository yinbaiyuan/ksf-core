import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TextField} from '@ksf/sdk/text-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextFieldClearableExample(){const [value,setValue]=useState('可以清空这段文字');return <div className='ksf-demo-stack'><TextField label='资料名称' value={value} onValueChange={setValue} clearable/><output>当前：{value||'空'}</output></div>;}
