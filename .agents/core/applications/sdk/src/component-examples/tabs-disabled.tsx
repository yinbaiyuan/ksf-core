import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tabs,type TabItem} from '@ksf/sdk/tabs';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TabsDisabledExample(){return <Tabs label='带禁用页签' items={[{id:'a',label:'可用页签',content:'可用内容'},{id:'b',label:'尚未开通',disabled:true,content:'不可访问'},{id:'c',label:'其他内容',content:'其他内容'}]}/>;}
