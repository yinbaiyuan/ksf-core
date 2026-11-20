import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Breadcrumb} from '@ksf/sdk/breadcrumb';
import {DropdownMenu} from '@ksf/sdk/dropdown-menu';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function BreadcrumbSeparatorsExample(){return <div className='ksf-demo-stack'><Breadcrumb separator='›' items={[{label:'工作区'},{label:'资料'},{label:'当前文档'}]}/><Breadcrumb separator={<ArrowGlyph/>} items={[{label:'首页'},{label:'任务'},{label:'详情'}]}/></div>;}
