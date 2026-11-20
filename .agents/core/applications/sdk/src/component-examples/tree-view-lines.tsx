import {useState} from 'react';
import {TreeView,type TreeNode} from '@ksf/sdk/tree-view';
import {Checkbox} from '@ksf/sdk/checkbox';
import {Icon} from '@ksf/sdk/icon';
import {Folder,FileText} from 'lucide-react';
import '@ksf/sdk/component-examples/catalog-examples.css';
const nodes:readonly TreeNode[]=[{id:'root',label:'项目',icon:<Icon icon={Folder} size={14}/>,children:[{id:'design',label:'设计',icon:<Icon icon={Folder} size={14}/>,children:[{id:'ui',label:'界面',icon:<Icon icon={FileText} size={14}/>},{id:'motion',label:'动效',icon:<Icon icon={FileText} size={14}/>} ]},{id:'research',label:'研究',icon:<Icon icon={FileText} size={14}/>},{id:'disabled',label:'暂不可用',disabled:true,icon:<Icon icon={FileText} size={14}/>}]}];
export function TreeViewLinesExample(){const [leaf,setLeaf]=useState(false),[icons,setIcons]=useState(false);return <div className="ksf-demo-stack"><Checkbox label="叶节点显示文件图标" checked={leaf} onChange={event=>setLeaf(event.currentTarget.checked)}/><Checkbox label="显示应用提供的节点图标" checked={icons} onChange={event=>setIcons(event.currentTarget.checked)}/><TreeView label="项目树" nodes={nodes} defaultExpandedIds={['root','design']} showLines showLeafIcons={leaf} showIcons={icons}/></div>;}
