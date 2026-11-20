import {useState,type SVGProps} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Menubar} from '@ksf/sdk/menubar';
export function MenubarStatesExample(){const [result,setResult]=useState('尚未选择');return <div className='ksf-demo-stack'><Menubar label='应用内示例菜单' menus={[{id:'file',label:'文件',items:[{id:'new',label:'新建资料',onAction:()=>setResult('新建资料')}]},{id:'disabled',label:'暂不可用',disabled:true,items:[]},{id:'view',label:'查看',items:[{id:'summary',label:'切换摘要',onAction:()=>setResult('切换摘要')},{id:'sub',label:'更多视图',items:[{id:'grid',label:'网格',onAction:()=>setResult('网格视图')}]}]}]}/><output role='status'>{result}</output><p>左右方向键跳过禁用菜单；此组件用于应用内容，不替代宿主菜单栏。</p></div>;}
