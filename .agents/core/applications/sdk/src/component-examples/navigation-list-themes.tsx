import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {View} from '@ksf/sdk/view';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function NavigationListThemesExample(){return <div className='ksf-demo-row'>{(['light','dark'] as const).map(theme=><View key={theme} theme={theme} style={{padding:12,borderRadius:8,flex:1,minWidth:160}}><NavigationList label={theme+'导航'} items={[{id:'home',label:'概览',icon:<FolderGlyph/>},{id:'projects',label:'项目',icon:<FolderGlyph/>,children:[{id:'research',label:'研究项目'},{id:'delivery',label:'交付项目'}]},{id:'settings',label:'设置',icon:<CheckGlyph/>,children:[{id:'appearance',label:'外观'},{id:'account',label:'账号',disabled:true}]}]} defaultExpandedIds={['projects']}/></View>)}</div>;}
