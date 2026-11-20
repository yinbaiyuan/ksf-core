import {Card} from '@ksf/sdk/card';
import {Button} from '@ksf/sdk/button';
import {Masonry} from '@ksf/sdk/masonry';
import {Heading,Text} from '@ksf/sdk/typography';
import {componentContracts} from '@ksf/sdk/component-catalog';
import {ComponentLivePreview} from './component-live-preview';
import type {LibraryController} from './library-controller';
export function ComponentGallery({controller:c}:{controller:LibraryController}){
 const groups=c.groups.filter(g=>!c.route.group||g.id===c.route.group.id).map(g=>({...g,items:g.items.filter(i=>i.available)})).filter(g=>g.items.length);
 return <section className="component-gallery" aria-label="组件实览"><Heading level={3}>组件实览</Heading><Text size="small" tone="muted">{groups.reduce((n,g)=>n+g.items.length,0)} 项已具备 · 示例中的操作独立生效</Text>
  {groups.map(g=><section className="library-gallery-group" key={g.id} aria-label={g.label}>{!c.route.group&&<Heading level={4}>{g.label}</Heading>}<Masonry columnWidth={320} gap={12}>{g.items.map(item=>{const contract=componentContracts.find(v=>v.id===item.id),example=!c.filters.library?contract?.examples[0]:contract?.examples.find(e=>c.filters.library==='Kokonut UI'?e.referenceIds?.some(id=>id.startsWith('kokonut:')):!e.referenceIds?.some(id=>id.startsWith('kokonut:')));return <Card key={item.id} data-component-id={item.id} size="small" className="library-gallery-card" title={item.name} extra={<Button variant="text" aria-label={`查看 ${item.name} 详情`} onClick={()=>c.selectItem(item)}>{item.label}</Button>}>
   {example?<ComponentLivePreview exampleId={example.id} theme={c.theme}/>:<Text tone="muted">此来源暂无示例，可在详情查看目标参考。</Text>}
  </Card>;})}</Masonry></section>)}
 </section>;
}
