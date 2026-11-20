import {SearchField} from '@ksf/sdk/search-field';
import {Select} from '@ksf/sdk/select';
import {Button} from '@ksf/sdk/button';
import {Text} from '@ksf/sdk/typography';
import type {LibraryController} from './library-controller';
export function LibraryFilterFields({controller:c}:{controller:LibraryController}){
 return <>
  <Select label="交付情况" value={c.filters.availability} onValueChange={v=>c.updateFilter('availability',v as typeof c.filters.availability)} options={[{value:'all',label:'全部条目'},{value:'available',label:'已具备'},{value:'planned',label:'待实现'}]}/>
  <Select label="参考来源" value={c.filters.library||'all'} onValueChange={v=>c.updateFilter('library',(v==='all'?'':v) as typeof c.filters.library)} options={[{value:'all',label:'全部来源'},{value:'Ant Design',label:'Ant Design'},{value:'Kokonut UI',label:'Kokonut UI'}]}/>
  <Select label="条目类型" value={c.filters.kind||'all'} onValueChange={v=>c.updateFilter('kind',(v==='all'?'':v) as typeof c.filters.kind)} options={[{value:'all',label:'组件与组合'},{value:'component',label:'组件'},{value:'composition',label:'组合示例'}]}/>
 </>;
}
export function LibraryFilters({controller:c}:{controller:LibraryController}){
 const count=c.route.group?c.matching.filter(i=>c.route.group!.items.some(v=>v.id===i.id)).length:c.matching.length;
 return <div className="library-filters" role="group" aria-label="实览筛选">
  <div className="library-search"><SearchField label="查找组件" searchLabel="查找组件" value={c.filters.query} onValueChange={v=>c.updateFilter('query',v)} placeholder="名称、用途、编号或上游别名"/></div>
  <LibraryFilterFields controller={c}/>
  <div className="library-filter-result"><Text size="caption" tone="muted" role="status">{count} 个匹配项</Text><Button size="small" variant="text" disabled={!c.filtering} onClick={c.resetFilters}>重置筛选</Button></div>
 </div>;
}
