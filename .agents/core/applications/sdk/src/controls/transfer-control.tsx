import {forwardRef,useEffect,useRef,useState,type CSSProperties,type HTMLAttributes,type ReactNode} from 'react';
import {useValue,useElementRef,useFormReset,cx} from '../primitives/state';
import {useWindowContext} from '../window-context';
import {ControlIcon} from '../primitives/control-icons';
import {EmptyIllustration} from '../primitives/empty-illustration';
import {Button} from '../button';
import {DropdownMenu,type MenuItem} from '../dropdown-menu';
import {Checkbox,TextField,type ChoiceOption} from './inputs';
import {transferLists,transferSelection,moveTransfer,transferRange} from './transfer-model';
import './transfer.css';
type Side='source'|'target';
export interface TransferListContext {side:Side;options:readonly ChoiceOption[];selectedIds:readonly string[];onSelectionChange:(ids:string[])=>void;disabled:boolean}
export interface TransferProps extends Omit<HTMLAttributes<HTMLDivElement>,'defaultValue'|'onChange'> {
 label:string;options:readonly ChoiceOption[];value?:readonly string[];defaultValue?:readonly string[];onValueChange?:(value:string[])=>void;
 disabled?:boolean;searchable?:boolean;name?:string;form?:string;oneWay?:boolean;titles?:readonly [ReactNode,ReactNode];actions?:readonly [ReactNode,ReactNode];pageSize?:number;showSelectAll?:boolean;
 renderOption?:(option:ChoiceOption)=>ReactNode;renderList?:(context:TransferListContext)=>ReactNode;footer?:(side:Side)=>ReactNode;
 columnStyle?:CSSProperties|((side:Side)=>CSSProperties);status?:'default'|'warning'|'error';
}
interface SectionProps {
 side:Side;options:readonly ChoiceOption[];selected:readonly string[];onSelected:(ids:string[])=>void;onRemove:(ids:string[])=>void;
 disabled:boolean;searchable:boolean;removable:boolean;title:ReactNode;pageSize?:number;showSelectAll:boolean;resetVersion:number;
 renderOption?:TransferProps['renderOption'];renderList?:TransferProps['renderList'];footer?:TransferProps['footer'];style?:CSSProperties;
}
function TransferSection({side,options,selected,onSelected,onRemove,disabled,searchable,removable,title,pageSize,showSelectAll,resetVersion,renderOption,renderList,footer,style}:SectionProps){
 const [query,setQuery]=useState(''),[storedPage,setPage]=useState(1),[pageDraft,setPageDraft]=useState('1'),anchor=useRef<string|null>(null);
 const filtered=options.filter(option=>option.label.includes(query)),size=Number.isFinite(pageSize)&&pageSize!>0?Math.max(1,Math.floor(pageSize!)):0,pages=Math.max(1,size?Math.ceil(filtered.length/size):1),page=Math.min(storedPage,pages),visible=size?filtered.slice((page-1)*size,page*size):filtered;
 const enabled=filtered.filter(option=>!option.disabled).map(option=>option.value),onPage=visible.filter(option=>!option.disabled).map(option=>option.value),chosen=selected.filter(id=>enabled.includes(id)),all=enabled.length>0&&chosen.length===enabled.length;
 useEffect(()=>{setPage(p=>Math.min(p,pages));},[pages]);
 useEffect(()=>{setPageDraft(String(page));},[page]);
 useEffect(()=>{setQuery('');setPage(1);setPageDraft('1');anchor.current=null;},[resetVersion]);
 const select=(ids:readonly string[],checked:boolean)=>{if(disabled)return;onSelected(checked?[...new Set([...selected,...ids])]:selected.filter(id=>!ids.includes(id)));};
 const invert=()=>{if(disabled)return;onSelected([...selected.filter(id=>!onPage.includes(id)),...onPage.filter(id=>!selected.includes(id))]);};
 const menuItems:MenuItem[]=removable?[
  ...(size?[{id:'remove-page',label:'删除当页',disabled:!onPage.length,onAction:()=>onRemove(onPage)}]:[]),
  {id:'remove-all',label:'删除全部',disabled:!enabled.length,onAction:()=>onRemove(enabled)}
 ]:[
  {id:'all',label:all?'取消全选':'全选所有',disabled:!enabled.length,onAction:()=>select(enabled,!all)},
  ...(size?[{id:'page',label:'全选当页',disabled:!onPage.length,onAction:()=>select(onPage,true)}]:[]),
  {id:'invert',label:'反选当页',disabled:!onPage.length,onAction:invert}
 ];
 const changePage=(next:number)=>{if(!disabled)setPage(Math.max(1,Math.min(pages,next)));};
 const commitPage=()=>{const next=Number(pageDraft);changePage(Number.isFinite(next)&&next>0?Math.floor(next):page);setPageDraft(String(Number.isFinite(next)&&next>0?Math.max(1,Math.min(pages,Math.floor(next))):page));};
 const selection=(ids:string[])=>{if(!disabled)onSelected(transferSelection(ids,options));};
 const count=chosen.length&&!removable?`${chosen.length}/${filtered.length} 项`:`${filtered.length} 项`;
 return <section className="ksf-transfer-column" data-pagination={!!size||undefined} data-custom={!!renderList||undefined} data-removable={removable||undefined} style={style} aria-label={side==='source'?'来源列表':'目标列表'}>
  <header className="ksf-transfer-header">
   {showSelectAll&&<div className="ksf-transfer-select-all">
    {!size&&!removable&&<Checkbox aria-label={side==='source'?'全选来源':'全选目标'} checked={all} indeterminate={chosen.length>0&&!all} disabled={disabled||!enabled.length} onCheckedChange={checked=>select(enabled,checked)}/>}
    <DropdownMenu label={side==='source'?'来源选择操作':'目标选择操作'} trigger={<ControlIcon name="DownOutlined"/>} triggerMode="hover" disabled={disabled} variant="text" className="ksf-transfer-dropdown" triggerProps={{size:'small'}} items={menuItems}/>
   </div>}
   <span className="ksf-transfer-count">{count}</span><span className="ksf-transfer-title">{title}</span>
  </header>
  {searchable&&<div className="ksf-transfer-search"><TextField aria-label={side==='source'?'搜索可选资料':'搜索已选资料'} placeholder="请输入搜索内容" value={query} prefix={<ControlIcon name="SearchOutlined"/>} onValueChange={next=>{if(disabled)return;setQuery(next);setPage(1);anchor.current=null;}} disabled={disabled} clearable/></div>}
  <div className="ksf-transfer-scroll">{renderList?renderList({side,options:visible,selectedIds:selected,onSelectionChange:selection,disabled}):filtered.length?<ul className="ksf-transfer-options">{visible.map(option=><li key={option.value} data-selected={!removable&&selected.includes(option.value)||undefined} data-disabled={disabled||option.disabled||undefined} title={option.label}>
   {removable?<><span className="ksf-transfer-option-text">{renderOption?renderOption(option):option.label}</span><button type="button" className="ksf-transfer-remove" disabled={disabled||option.disabled} aria-label={`移除已选：${option.label}`} onClick={()=>onRemove([option.value])}><ControlIcon name="DeleteOutlined"/></button></>:<Checkbox checked={selected.includes(option.value)} disabled={disabled||option.disabled} label={<span className="ksf-transfer-option-text">{renderOption?renderOption(option):<>{option.icon}{option.label}{option.description&&<small>{option.description}</small>}</>}</span>} onChange={event=>{if(disabled||option.disabled)return;onSelected(transferRange(selected,filtered,anchor.current,option.value,event.target.checked,!!(event.nativeEvent as MouseEvent).shiftKey));anchor.current=option.value;}}/>}
  </li>)}</ul>:<div className="ksf-transfer-empty"><EmptyIllustration/><span>暂无数据</span></div>}</div>
  {!!size&&<div className="ksf-transfer-pagination"><button type="button" aria-label={side==='source'?'来源上一页':'目标上一页'} disabled={disabled||page<=1} onClick={()=>changePage(page-1)}><ControlIcon name="LeftOutlined"/></button><label><input aria-label={side==='source'?'来源当前页':'目标当前页'} inputMode="numeric" value={pageDraft} disabled={disabled} onFocus={event=>event.currentTarget.select()} onChange={event=>setPageDraft(event.target.value)} onBlur={commitPage} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commitPage();}else if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();changePage(page+(event.key==='ArrowUp'?1:-1));}}}/><span aria-hidden="true">/</span><span>{pages}</span></label><button type="button" aria-label={side==='source'?'来源下一页':'目标下一页'} disabled={disabled||page>=pages} onClick={()=>changePage(page+1)}><ControlIcon name="RightOutlined"/></button></div>}
  {footer&&<footer>{footer(side)}</footer>}
 </section>;
}
export const Transfer=forwardRef<HTMLDivElement,TransferProps>(function Transfer({label,options,value,defaultValue=[],onValueChange,disabled=false,searchable=false,name,form,oneWay=false,titles=['',''],actions=[],pageSize,showSelectAll=true,renderOption,renderList,footer,columnStyle,status='default',className='',...props},ref){
 const [current,setCurrent,reset]=useValue<readonly string[]>(value,defaultValue,next=>onValueChange?.([...next])),[left,setLeft]=useState<string[]>([]),[right,setRight]=useState<string[]>([]),[resetVersion,setResetVersion]=useState(0),formOwner=useRef<HTMLInputElement>(null),context=useWindowContext(),[,assign]=useElementRef(ref);
 const interactive=!disabled&&context.active&&context.enabled,lists=transferLists(options,current),selectedLeft=transferSelection(left,lists.source),selectedRight=transferSelection(right,lists.target);
 useFormReset(formOwner,true,()=>{if(value===undefined)reset();setLeft([]);setRight([]);setResetVersion(n=>n+1);},form);
 useEffect(()=>{setLeft(previous=>{const next=previous.filter(id=>lists.source.some(option=>option.value===id));return next.length===previous.length?previous:next;});setRight(previous=>{const next=previous.filter(id=>lists.target.some(option=>option.value===id));return next.length===previous.length?previous:next;});},[options,current]);
 const move=(direction:'add'|'remove',ids:readonly string[])=>{if(!interactive)return;const next=moveTransfer(current,ids,options,direction);if(next.length!==current.length||next.some((id,index)=>id!==current[index]))setCurrent(next);if(direction==='add')setLeft([]);else setRight([]);};
 const column=(side:Side)=><TransferSection {...{side,searchable,pageSize,showSelectAll,resetVersion,renderOption,renderList,footer}} options={lists[side]} selected={side==='source'?selectedLeft:selectedRight} onSelected={side==='source'?setLeft:setRight} onRemove={ids=>move('remove',ids)} disabled={!interactive} removable={oneWay&&side==='target'} title={titles[side==='source'?0:1]} style={typeof columnStyle==='function'?columnStyle(side):columnStyle}/>;
 return <div {...props} ref={assign} className={cx('ksf-transfer',className)} data-status={status} data-disabled={disabled||undefined} data-active={context.active&&context.enabled} role="group" aria-label={label}>
  {column('source')}<div className="ksf-transfer-actions"><Button size="small" variant="solid" tone="primary" aria-label="添加选中资料" disabled={!interactive||!selectedLeft.length} onClick={()=>move('add',selectedLeft)}><ControlIcon name="RightOutlined"/>{actions[0]}</Button>{!oneWay&&<Button size="small" variant="solid" tone="primary" aria-label="移回选中资料" disabled={!interactive||!selectedRight.length} onClick={()=>move('remove',selectedRight)}><ControlIcon name="LeftOutlined"/>{actions[1]}</Button>}</div>{column('target')}
  <input ref={formOwner} type="hidden" form={form} disabled={disabled}/>{name&&current.map((id,index)=><input key={`${id}:${index}`} type="hidden" form={form} name={name} value={id} disabled={disabled}/>) }
 </div>;
});
