import {useState,useRef,useId} from 'react';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function NavigationListBasicExample(){const [value,setValue]=useState('overview');return <div className='ksf-demo-stack'><NavigationList label='项目导航' items={[{id:'overview',label:'项目概览',icon:'◫'},{id:'files',label:'资料管理',icon:'▤',children:[{id:'design',label:'设计资料'},{id:'delivery',label:'交付资料'}]},{id:'locked',label:'归档',disabled:true}]} selectedId={value} onSelect={setValue} defaultExpandedIds={['files']}/><output>当前：{value}</output></div>;}
