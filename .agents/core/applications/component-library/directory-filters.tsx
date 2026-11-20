import {useEffect,useRef,useState} from 'react';
import {SlidersHorizontal} from 'lucide-react';
import {SearchField} from '@ksf/sdk/search-field';
import {Popover} from '@ksf/sdk/popover';
import {ScrollArea} from '@ksf/sdk/scroll-area';
import {Button} from '@ksf/sdk/button';
import {Text} from '@ksf/sdk/typography';
import {useWindowContext} from '@ksf/sdk/window-context';
import {LibraryFilterFields} from './library-filters';
import type {LibraryController} from './library-controller';

export function DirectoryFilters({controller:c}:{controller:LibraryController}){
 const [open,setOpen]=useState(false),context=useWindowContext();
 const searchInput=useRef<HTMLInputElement>(null),fields=useRef<HTMLDivElement>(null);
 const count=Number(c.filters.availability!=='all')+Number(Boolean(c.filters.library))+Number(Boolean(c.filters.kind));
 const resetAll=()=>{c.resetFilters();searchInput.current?.focus({preventScroll:true});};
 const resetConditions=()=>{c.resetFacetFilters();const area=fields.current;if(area){area.scrollTop=0;area.querySelector<HTMLSelectElement>('select')?.focus({preventScroll:true});}};
 useEffect(()=>setOpen(false),[c.narrow,c.directoryOpen]);
 useEffect(()=>{if(!context.active||!context.enabled)setOpen(false);},[context.active,context.enabled]);
 return <div className="library-directory-filters" role="group" aria-label="目录筛选">
  <SearchField ref={searchInput} aria-label="查找组件" searchLabel="查找组件" title="支持名称、用途、编号和上游别名" placeholder="搜索组件…" clearable value={c.filters.query} onValueChange={v=>c.updateFilter('query',v)} onSearch={v=>c.updateFilter('query',v)}/>
  <div className="library-directory-tools">
   <Text className="library-directory-result" size="caption" tone="muted" role="status" aria-label={`${c.matching.length} 个匹配条目，共 ${c.inventory.items} 项`}>{c.matching.length} 项</Text>
   <div className="library-directory-tool-actions">
    {c.filtering&&<Button size="small" variant="text" aria-label="重置筛选" title="清除搜索和筛选" onClick={resetAll}>重置</Button>}
    <Popover trigger="click" placement="bottom-end" arrow={false} label="筛选组件" heading="筛选组件" open={open} onOpenChange={setOpen} content={<div className="library-directory-filter-content" style={{maxHeight:Math.max(0,c.height-96)}}>
     <ScrollArea ref={fields} label="筛选条件" tabIndex={-1} className="library-directory-filter-fields library-scroll-area"><LibraryFilterFields controller={c}/></ScrollArea>
     <div className="library-directory-filter-footer"><Button size="small" variant="text" disabled={!count} onClick={resetConditions}>重置条件</Button><Button size="small" tone="primary" variant="solid" onClick={()=>setOpen(false)}>完成</Button></div>
    </div>}>
     <Button size="small" variant="text" tone={count?'primary':undefined} aria-label={count?`筛选组件，已启用 ${count} 项`:'筛选组件'}><SlidersHorizontal size={14} aria-hidden="true"/>筛选{count?` (${count})`:''}</Button>
    </Popover>
   </div>
  </div>
 </div>;
}
