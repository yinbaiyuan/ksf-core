import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {View} from '@ksf/sdk/view';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function NavigationListCollapsedExample(){const [collapsed,setCollapsed]=useState(false),[selected,setSelected]=useState('home');return <div className='ksf-demo-stack'><Button size='small' onClick={()=>setCollapsed(v=>!v)}>{collapsed?'展开导航':'收起导航'}</Button><NavigationList label='可收起导航' collapsed={collapsed} items={[{id:'home',label:'概览',icon:<FolderGlyph/>},{id:'projects',label:'项目',icon:<FolderGlyph/>,children:[{id:'research',label:'研究项目'},{id:'delivery',label:'交付项目'}]},{id:'settings',label:'设置',icon:<CheckGlyph/>,children:[{id:'appearance',label:'外观'},{id:'account',label:'账号',disabled:true}]}]} selectedId={selected} onSelect={setSelected}/></div>;}
