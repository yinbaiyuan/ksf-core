import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Breadcrumb} from '@ksf/sdk/breadcrumb';
import {DropdownMenu} from '@ksf/sdk/dropdown-menu';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function BreadcrumbIconsExample(){return <Breadcrumb items={[{label:<span className='ksf-demo-row'><FolderGlyph/>工作区</span>,onClick:()=>{}},{label:'项目资料',onClick:()=>{}},{label:'当前文档'}]}/>;}
