import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {View} from '@ksf/sdk/view';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function NavigationListRootStyleExample(){return <NavigationList label='自定义样式导航' style={{padding:12,border:'1px solid var(--ksf-color-border)',borderRadius:12,background:'var(--ksf-color-surface-raised)'}} items={[{id:'home',label:'概览',icon:<FolderGlyph/>},{id:'projects',label:'项目',icon:<FolderGlyph/>,children:[{id:'research',label:'研究项目'},{id:'delivery',label:'交付项目'}]},{id:'settings',label:'设置',icon:<CheckGlyph/>,children:[{id:'appearance',label:'外观'},{id:'account',label:'账号',disabled:true}]}]} defaultExpandedIds={['projects']}/>;}
