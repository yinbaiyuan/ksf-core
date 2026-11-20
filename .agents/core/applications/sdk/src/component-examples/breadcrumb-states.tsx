import {useState,useRef,useId} from 'react';
import {Breadcrumb} from '@ksf/sdk/breadcrumb';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function BreadcrumbStatesExample(){return <div className='ksf-demo-stack'><Breadcrumb separator='›' items={[{label:'工作空间'},{label:'资料'},{label:'长标题在窄窗口中自然换行'}]}/><Breadcrumb items={[{label:'仅当前页面'}]}/></div>;}
