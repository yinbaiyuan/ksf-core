import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Breadcrumb} from '@ksf/sdk/breadcrumb';
import {DropdownMenu} from '@ksf/sdk/dropdown-menu';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function BreadcrumbDropdownExample(){const [project,setProject]=useState('空间规划');return <Breadcrumb items={[{label:'工作区'},{label:<DropdownMenu label='切换项目' variant='text' trigger={project} items={['空间规划','设备研究','用户访谈'].map(label=>({id:label,label,onAction:()=>setProject(label)}))}/>},{label:'当前资料'}]}/>;}
