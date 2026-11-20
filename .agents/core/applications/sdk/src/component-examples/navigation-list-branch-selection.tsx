import {useState} from 'react';
import {NavigationList} from '@ksf/sdk/navigation-list';
import {Button} from '@ksf/sdk/button';

export function NavigationListBranchSelectionExample(){
 const [selected,setSelected]=useState('overview'),[expanded,setExpanded]=useState<readonly string[]>(['docs']),[mode,setMode]=useState<'vertical'|'horizontal'|'collapsed'>('vertical');
 return <div style={{width:'100%',minWidth:0,display:'grid',gap:12}}>
  <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{(['vertical','horizontal','collapsed'] as const).map((value,i)=><Button key={value} size="small" aria-pressed={mode===value} onClick={()=>setMode(value)}>{['纵向','横向','折叠'][i]}</Button>)}</div>
  <NavigationList label="父项导航示例" selectBranches layout={mode==='horizontal'?'horizontal':'vertical'} collapsed={mode==='collapsed'} items={[{id:'overview',label:'概览'},{id:'docs',label:'文档',children:[{id:'guide',label:'使用指南'},{id:'api',label:'接口参考'}]},{id:'settings',label:'设置',children:[{id:'appearance',label:'外观'}]},{id:'archive',label:'归档',disabled:true,children:[{id:'old',label:'历史版本'}]}]} selectedId={selected} onSelect={setSelected} expandedIds={expanded} onExpandedChange={setExpanded}/>
  <output aria-label="导航选择结果">当前：{selected}；展开：{expanded.join('、')||'无'}</output>
 </div>;
}
