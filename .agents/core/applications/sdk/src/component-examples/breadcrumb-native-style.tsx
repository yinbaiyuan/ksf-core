import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Breadcrumb} from '@ksf/sdk/breadcrumb';
import {DropdownMenu} from '@ksf/sdk/dropdown-menu';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function BreadcrumbNativeStyleExample(){return <Breadcrumb style={{padding:14,borderRadius:8,background:'var(--ksf-color-primary-surface)'}} separator='→' items={[{label:'项目'},{label:'资料'},{label:'预览'}]}/>;}
