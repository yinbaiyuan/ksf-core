import {useState,type SVGProps} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {ContextMenu} from '@ksf/sdk/context-menu';
export function ContextMenuStatesExample(){const [result,setResult]=useState('尚未选择');return <div className='ksf-demo-stack'><ContextMenu label='文件内容区域' style={{padding:24,border:'1px dashed var(--ksf-color-border-strong)',borderRadius:8}} items={[{id:'copy',label:'复制示例',onAction:()=>setResult('已选择复制')},{id:'open',label:'打开方式',items:[{id:'text',label:'文本预览',onAction:()=>setResult('已选择文本预览')}]},{id:'remove',label:'移除示例',danger:true,onAction:()=>setResult('已选择移除')}]}>聚焦区域后按Shift+F10，或在此右键。</ContextMenu><output role='status'>{result}</output></div>;}
