import {lazy,Suspense} from 'react';
import {Button} from '@ksf/sdk/button';
import {Grid} from '@ksf/sdk/grid';
import {Card} from '@ksf/sdk/card';
import {Statistic} from '@ksf/sdk/statistic';
import {Heading,Text} from '@ksf/sdk/typography';
import {EmptyState} from '@ksf/sdk/empty-state';
import {Breadcrumb} from '@ksf/sdk/breadcrumb';
import {Skeleton} from '@ksf/sdk/skeleton';
import {componentReferences} from '@ksf/sdk/component-catalog';
import {LibraryFilters} from './library-filters';
import {CategoryCard} from './category-card';
import type {LibraryController} from './library-controller';
const ComponentGallery=lazy(()=>import('./component-gallery').then(m=>({default:m.ComponentGallery})));
export function CatalogPage({controller:c}:{controller:LibraryController}){
 const group=c.route.group;
 if(!group)return <>
  <header className="library-page-heading"><Heading level={1}>组件总览</Heading><Text as="p" tone="muted">选择分类查看基础实览，进入组件详情了解用法与 API。</Text></header>
  <section className="library-inventory" aria-label="组件库统计"><Grid columns="repeat(auto-fit,minmax(100px,1fr))" gap={24}>{[[c.inventory.groups,'分类'],[c.inventory.items,'目录条目'],[c.inventory.available,'已具备'],[c.inventory.items-c.inventory.available,'待实现']].map(([value,title])=><Statistic key={title} title={title} value={value}/>)}</Grid><Text as="p" size="small" tone="muted">默认基础参考 Ant Design {componentReferences.baseline.version}，Kokonut UI 免费组件提供可选效果与组合示例。</Text></section>
  <section aria-label="分类分组"><Heading level={3}>分类分组</Heading>{c.groups.length?<Grid className="library-category-grid" gap={16}>{c.groups.map(g=><CategoryCard key={g.id} group={g} filtering={c.filtering} onSelect={c.selectGroup}/>)}</Grid>:<EmptyState heading="没有匹配分类" description="调整左侧搜索或筛选条件后重试。" actions={<Button onClick={c.resetFilters}>重置筛选</Button>}/>}</section>
 </>;
 const matching=c.matching.filter(i=>group.items.some(v=>v.id===i.id)),planned=matching.filter(i=>!i.available),available=group.items.filter(i=>i.available).length;
 return <>
  <header className="library-page-heading"><Breadcrumb items={[{label:'组件总览',onClick:c.overview},{label:group.label}]}/><Heading level={1}>{group.label}</Heading><Text as="p" tone="muted">{group.scope}</Text><Text size="small" tone="muted">{group.items.length} 项 · {available} 项已具备 · {group.items.length-available} 项待实现</Text></header>
  <LibraryFilters controller={c}/>
  {!matching.length&&<EmptyState heading="本分类没有匹配条目" description="调整搜索或筛选条件，或返回组件总览。" actions={<><Button onClick={c.resetFilters}>重置筛选</Button><Button variant="text" onClick={c.overview}>返回组件总览</Button></>}/>}
  {matching.some(i=>i.available)&&<Suspense fallback={<div role="status" aria-label="加载分类实览"><Skeleton active rows={4}/></div>}><ComponentGallery key={group.id} controller={c}/></Suspense>}
  {planned.length>0&&<section><Heading level={3}>待实现条目</Heading><Grid minItemWidth={220}>{planned.map(i=><Card key={i.id} size="small" title={i.label} description={i.name} extra={<Button variant="text" onClick={()=>c.selectItem(i)}>查看候选</Button>}/>)}</Grid></section>}
 </>;
}
