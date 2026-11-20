import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {View} from '@ksf/sdk/view';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function NavigationListHorizontalExample(){const [selected,setSelected]=useState('home');return <div className='ksf-demo-stack'><NavigationList label='横向导航示例' layout='horizontal' items={[{id:'home',label:'概览',icon:<FolderGlyph/>},{id:'projects',label:'项目',icon:<FolderGlyph/>,children:[{id:'research',label:'研究项目'},{id:'delivery',label:'交付项目'}]},{id:'settings',label:'设置',icon:<CheckGlyph/>,children:[{id:'appearance',label:'外观'},{id:'account',label:'账号',disabled:true}]}]} selectedId={selected} onSelect={setSelected}/><output>当前页面：{selected}</output></div>;}
