import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TextField} from '@ksf/sdk/text-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextFieldAffixesExample(){return <div className='ksf-demo-stack'><TextField label='搜索资料' prefix={<SearchGlyph/>} suffix='.md' placeholder='资料名称'/><TextField label='金额' prefix='¥' suffix='元' defaultValue='1200'/><TextField label='已验证输入' suffix={<CheckGlyph/>} defaultValue='资料已确认'/></div>;}
