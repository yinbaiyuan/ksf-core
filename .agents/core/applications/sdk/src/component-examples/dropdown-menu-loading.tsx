import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DropdownMenu,type MenuItem} from '@ksf/sdk/dropdown-menu';
import {ButtonGroup} from '@ksf/sdk/button-group';
import {Popover} from '@ksf/sdk/popover';
import {TextField} from '@ksf/sdk/text-field';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function DropdownMenuLoadingExample(){const [busy,setBusy]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);useEffect(()=>()=>clearTimeout(timer.current),[]);return <div className='ksf-demo-stack'><Button size='small' onClick={()=>{setBusy(true);timer.current=setTimeout(()=>setBusy(false),1400);}}>重新读取菜单</Button><DropdownMenu label='异步菜单' disabled={busy} triggerProps={{loading:busy}} items={[{id:'one',label:'操作已就绪',onAction:()=>{}}]}/></div>;}
