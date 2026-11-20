import type {CatalogItem, CatalogGroup} from './catalog';
export type DetailTab = 'preview' | 'usage' | 'api';
export const detailTabs: {id: DetailTab; label: string}[] = [{id:'preview',label:'预览'},{id:'usage',label:'用法'},{id:'api',label:'API'}];
export interface LibraryFilters {query:string;availability:'all'|'available'|'planned';library:''|'Ant Design'|'Kokonut UI';kind:''|'component'|'composition'}
export const emptyFilters:LibraryFilters={query:'',availability:'all',library:'',kind:''};
export function readLibraryRoute(search:URLSearchParams,items:readonly CatalogItem[],groups:readonly CatalogGroup[]){
 const requested=search.get('section'),legacy=requested==='design-compare'||requested==='live-components';
 const section=legacy?'catalog':items.find(i=>i.available?.section===requested)?.available?.section??'catalog';
 const item=legacy?undefined:section==='catalog'?items.find(i=>i.id===search.get('item')):items.find(i=>i.available?.section===section);
 const group=item?groups.find(g=>g.items.some(i=>i.id===item.id)):legacy?undefined:groups.find(g=>g.id===search.get('group'));
 const tab:DetailTab=detailTabs.find(t=>t.id===search.get('tab'))?.id??'preview';
 return {section,item,group,tab,exampleId:search.get('example')??undefined,legacy};
}
export function hasLibraryFilters(f:LibraryFilters){return Boolean(f.query.trim()||f.library||f.kind||f.availability!=='all');}
