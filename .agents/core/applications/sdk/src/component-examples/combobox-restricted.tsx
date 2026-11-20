import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Combobox} from '@ksf/sdk/combobox';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ComboboxRestrictedExample(){return <Combobox label='指定项目' allowCustom={false} options={[{value:'research',label:'研究项目'},{value:'delivery',label:'交付项目'},{value:'disabled',label:'暂停的项目',disabled:true}]} description='输入后通过建议选项确认；离开时未匹配文本会恢复。'/>;}
