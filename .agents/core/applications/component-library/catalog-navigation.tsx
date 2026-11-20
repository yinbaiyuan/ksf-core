import {NavigationList,type NavigationItem} from '@ksf/sdk/navigation-list';
import {ScrollArea} from '@ksf/sdk/scroll-area';
import {Badge} from '@ksf/sdk/badge';
import {Text,Heading} from '@ksf/sdk/typography';
import type {LibraryController} from './library-controller';
import {DirectoryFilters} from './directory-filters';
export function CatalogNavigation({controller:c,showHeading=true}:{controller:LibraryController;showHeading?:boolean}){
 const items:NavigationItem[]=[{id:'overview',label:'组件总览'},...c.groups.map(group=>({id:group.id,label:<span className="library-nav-group" title={`${group.label} · ${group.items.length} 项`}><span className="library-nav-title">{group.label}</span><Text className="library-nav-count" size="caption" tone="muted">{group.items.length}</Text></span>,children:group.items.map(item=>({id:item.id,icon:<Badge status={item.available?'success':'default'} label={item.available?'已具备':'待实现'}/>,label:<span className="library-nav-item" title={`${item.id} ${item.label} ${item.name}`}><span>{item.label}</span><Text size="caption" tone="muted" ellipsis>{item.name}</Text></span>}))}))];
 return <div className="library-directory" data-library-directory>
  {showHeading&&<div className="library-directory-heading"><Heading level={5}>KSF 组件库</Heading><Text size="caption" tone="muted" aria-label={`${c.inventory.groups} 个分类`}>{c.inventory.groups} 类</Text></div>}
  <DirectoryFilters controller={c}/>
  <ScrollArea label="组件目录列表" className="library-directory-scroll library-scroll-area">
   <NavigationList className="library-directory-nav" label="组件分类" selectBranches style={{background:'transparent',borderInlineEnd:0}} items={items} selectedId={c.route.item?.id??c.route.group?.id??'overview'} expandedIds={c.expandedIds} onExpandedChange={c.setExpandedIds} onSelect={id=>{if(id==='overview')c.overview();else if(c.groups.some(g=>g.id===id)){c.setExpandedIds([...new Set([...c.expandedIds,id])]);c.selectGroup(id);}else {const item=c.matching.find(i=>i.id===id);if(item)c.selectItem(item);}}}/>
   {!c.groups.length&&<Text tone="muted">没有匹配组件，可重置筛选。</Text>}
  </ScrollArea>
 </div>;
}
