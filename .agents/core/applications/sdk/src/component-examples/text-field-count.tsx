import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TextField} from '@ksf/sdk/text-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextFieldCountExample(){return <div className='ksf-demo-stack'><TextField label='常规字数' defaultValue='中文与emoji🙂' maxLength={30} showCount/><TextField label='自定义计数文案' showCount={({length,maxLength})=>`已经输入${length}个字符，最多${maxLength}个代码单元`} maxLength={40}/></div>;}
