import {useState,useRef,useId} from 'react';
import {Breadcrumb} from '@ksf/sdk/breadcrumb';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function BreadcrumbBasicExample(){const [current,setCurrent]=useState('项目方案');return <div className='ksf-demo-stack'><Breadcrumb items={[{label:'工作空间',onClick:()=>setCurrent('工作空间')},{label:'项目资料',onClick:()=>setCurrent('项目资料')},{label:'项目方案'}]}/><output>当前位置：{current}</output></div>;}
