import {useState,useRef,useId} from 'react';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function NavigationListStatesExample(){const [collapsed,setCollapsed]=useState(false),[selected,setSelected]=useState('overview');return <div className='ksf-demo-stack'><Button onClick={()=>setCollapsed(v=>!v)}>切换紧凑导航</Button><NavigationList label='紧凑项目导航' collapsed={collapsed} items={[{id:'overview',label:'概览',icon:'◫'},{id:'files',label:'资料',icon:'▤'}]} selectedId={selected} onSelect={setSelected}/></div>;}
