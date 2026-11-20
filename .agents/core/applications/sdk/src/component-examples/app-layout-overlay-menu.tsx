import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {AppLayout} from '@ksf/sdk/app-layout';
import {Drawer} from '@ksf/sdk/drawer';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function AppLayoutOverlayMenuExample(){const [open,setOpen]=useState(false),[selected,setSelected]=useState('home');return <><AppLayout header={<Button size='small' onClick={()=>setOpen(true)}>打开覆盖导航</Button>} style={{height:220,border:'1px solid var(--ksf-color-border)'}}><DemoPanel>内容页面：{selected}</DemoPanel></AppLayout><Drawer open={open} title='工作区导航' side='start' size={260} onClose={()=>setOpen(false)}><NavigationList label='覆盖导航' selectedId={selected} onSelect={id=>{setSelected(id);setOpen(false);}} items={[{id:'home',label:'概览'},{id:'projects',label:'项目'},{id:'settings',label:'设置'}]}/></Drawer></>;}
