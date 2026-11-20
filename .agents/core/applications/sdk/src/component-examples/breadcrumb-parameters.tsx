import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Breadcrumb} from '@ksf/sdk/breadcrumb';
import {DropdownMenu} from '@ksf/sdk/dropdown-menu';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function BreadcrumbParametersExample(){const [project,setProject]=useState('空间规划'),[message,setMessage]=useState('');return <div className='ksf-demo-stack'><select aria-label='选择项目' value={project} onChange={e=>setProject(e.target.value)}><option>空间规划</option><option>设备研究</option></select><Breadcrumb items={[{label:'项目',onClick:()=>setMessage('返回项目列表')},{label:project,onClick:()=>setMessage('打开'+project)},{label:'资料详情'}]}/><output>{message}</output></div>;}
