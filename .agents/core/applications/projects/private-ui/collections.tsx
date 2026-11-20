import {useRef,type FormHTMLAttributes,type HTMLAttributes,type ReactNode} from 'react';
import {Button,Checkbox,Input,Select,type SelectOption} from './controls';
import {Field} from './field';
import {Badge,InlineAlert,Skeleton} from './feedback';
import {useUI} from './provider';
import {valueChange,type UIValueChangeDetail} from './events';
import {stableIds} from './composition-model';
import type {SaveView} from '@ksf/sdk/controllers';

export type ContentLoadState='ready'|'loading'|'refreshing'|'empty'|'error'|'unavailable'|'unauthorized';
export interface ContentStateProps extends Omit<HTMLAttributes<HTMLDivElement>,'title'>{state:ContentLoadState;stale?:boolean;title?:ReactNode;description?:ReactNode;actions?:ReactNode;onRetry?:()=>void;variant?:'page'|'section'|'inline'}
const stateLabels:Record<ContentLoadState,string>={ready:'内容已取得',loading:'正在加载',refreshing:'正在更新',empty:'暂无内容',error:'内容未能载入',unavailable:'内容暂不可用',unauthorized:'没有访问权限'};
/** Retain explicitly permitted stale content, but never retain it after access is revoked. */
export function ContentState({state,stale=false,title,description,actions,onRetry,variant='section',children,className='',...props}:ContentStateProps){
 useUI();const retained=stale&&children!=null&&state!=='unauthorized'&&state!=='empty',show=state==='ready'||state==='refreshing'||retained;
 return <div {...props} data-ksf-component="content-state" data-state={state} data-variant={variant} data-stale={retained||undefined} aria-busy={state==='loading'||state==='refreshing'||undefined} className={className}>
  {state!=='ready'&&<div className="ksf-content-state-message">{state==='loading'&&!retained?<><div role="status">{title??stateLabels[state]}</div><Skeleton lines={3}/>{description&&<p>{description}</p>}{actions}</>:<InlineAlert tone={state==='error'||state==='unauthorized'?'danger':state==='unavailable'?'warning':'info'} title={title??stateLabels[state]} description={description??(retained?'当前仍显示上次取得的内容。':undefined)} actions={<>{actions}{onRetry&&<Button onActivate={onRetry}>重试</Button>}</>}/>}</div>}
  {show&&<div className="ksf-content-state-body">{children}</div>}
 </div>;
}

export interface FormError {id:string;message:string;fieldId?:string}
export interface FormProps extends Omit<FormHTMLAttributes<HTMLFormElement>,'onSubmit'|'onReset'>{errors?:readonly FormError[];validating?:boolean;busy?:boolean;disabled?:boolean;errorSummary?:string;onSubmitIntent?:()=>void;onResetIntent?:()=>void}
export function Form({errors=[],validating=false,busy=false,disabled=false,errorSummary='请检查以下内容',onSubmitIntent,onResetIntent,children,className='',...props}:FormProps){
 const ui=useUI(),form=useRef<HTMLFormElement>(null);stableIds(errors,error=>error.id);
 const focusError=(error:FormError)=>{const root=form.current;if(!root)return;const node=error.fieldId?root.querySelector<HTMLElement>('#'+CSS.escape(error.fieldId)):root.querySelector<HTMLElement>('[aria-invalid=true]');const target=node?.matches('input,textarea,select,button,[tabindex]')?node:node?.querySelector<HTMLElement>('input,textarea,select,button,[tabindex]');target?.focus();target?.scrollIntoView({block:'nearest',inline:'nearest'});};
 return <form {...props} ref={form} data-ksf-component="form" aria-busy={busy||validating||undefined} className={className} onSubmit={event=>{event.preventDefault();if(!ui.environment.active||!ui.environment.enabled||disabled||busy||validating)return;if(errors.length){focusError(errors[0]);return;}onSubmitIntent?.();}} onReset={event=>{event.preventDefault();if(!disabled&&!busy&&!validating&&ui.environment.active&&ui.environment.enabled)onResetIntent?.();}}>
  {!!errors.length&&<InlineAlert tone="danger" title={errorSummary}><ul className="ksf-form-error-list">{errors.map(error=><li key={error.id}><Button variant="ghost" onActivate={()=>focusError(error)}>{error.message}</Button></li>)}</ul></InlineAlert>}
  <fieldset disabled={disabled||!ui.environment.enabled} className="ksf-form-fields">{children}</fieldset>
 </form>;
}

export interface SearchFilter {id:string;label:string;options:readonly SelectOption[];disabled?:boolean}
export interface SearchFilterBarProps extends Omit<HTMLAttributes<HTMLFormElement>,'onSubmit'|'onChange'>{query:string;onQueryChange:(query:string,detail:UIValueChangeDetail)=>void;filters?:readonly SearchFilter[];filterValues?:Readonly<Record<string,string>>;onFiltersChange?:(values:Readonly<Record<string,string>>,detail:UIValueChangeDetail)=>void;onClear?:()=>void;onSearchIntent?:()=>void;onCompositionChange?:(composing:boolean)=>void;mode?:'immediate'|'explicit';loading?:boolean;disabled?:boolean;label?:string;placeholder?:string;actions?:ReactNode}
export function SearchFilterBar({query,onQueryChange,filters=[],filterValues={},onFiltersChange,onClear,onSearchIntent,onCompositionChange,mode='immediate',loading=false,disabled=false,label='搜索与筛选',placeholder='搜索',actions,className='',...props}:SearchFilterBarProps){
 const ui=useUI(),composing=useRef(false);stableIds(filters,filter=>filter.id);
 return <form {...props} data-ksf-component="search-filter-bar" role="search" aria-label={label} aria-busy={loading||undefined} className={className} onSubmit={event=>{event.preventDefault();if(!composing.current&&!disabled&&ui.environment.active&&ui.environment.enabled)onSearchIntent?.();}}>
  <Field label="搜索" layout="inline"><Input type="search" aria-label={label} value={query} placeholder={placeholder} disabled={disabled} clearable onValueChange={onQueryChange} onCompositionStart={()=>{composing.current=true;onCompositionChange?.(true);}} onCompositionEnd={()=>{composing.current=false;onCompositionChange?.(false);}} onKeyDown={event=>{if(event.key==='Enter'&&(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229))event.preventDefault();}}/></Field>
  {filters.map(filter=><Field key={filter.id} label={filter.label} layout="inline"><Select value={filterValues[filter.id]??''} options={filter.options.some(option=>option.value==='')?filter.options:[{value:'',label:'全部'},...filter.options]} disabled={disabled||filter.disabled||!onFiltersChange} onValueChange={(value,detail)=>onFiltersChange?.({...filterValues,[filter.id]:value},detail)}/></Field>)}
  {mode==='explicit'&&<Button type="submit" disabled={disabled||!onSearchIntent} busy={loading}>搜索</Button>}{onClear&&<Button variant="ghost" disabled={disabled} onActivate={onClear}>清除筛选</Button>}{actions}
 </form>;
}

export interface DataListProps<T> extends Omit<HTMLAttributes<HTMLDivElement>,'onSelect'>{items:readonly T[];getId:(item:T)=>string;getLabel:(item:T)=>string;label:string;renderItem?:(item:T)=>ReactNode;renderActions?:(item:T)=>ReactNode;selectionMode?:'none'|'single'|'multiple';selectedId?:string|null;selectedIds?:readonly string[];onSelect?:(id:string,detail:UIValueChangeDetail)=>void;onSelectionChange?:(ids:readonly string[],detail:UIValueChangeDetail)=>void;onActivate?:(id:string)=>void;isDisabled?:(item:T)=>boolean;disabledReason?:(item:T)=>string|undefined;loadState?:ContentLoadState;stale?:boolean;hasMore?:boolean;onLoadMore?:()=>void;onRetry?:()=>void;emptyTitle?:string}
export function DataList<T>({items,getId,getLabel,label,renderItem,renderActions,selectionMode='none',selectedId,selectedIds=[],onSelect,onSelectionChange,onActivate,isDisabled,disabledReason,loadState='ready',stale=false,hasMore=false,onLoadMore,onRetry,emptyTitle='暂无条目',className='',...props}:DataListProps<T>){
 const ui=useUI(),ids=stableIds(items,getId),selected=new Set(selectedIds),state=loadState==='ready'&&!items.length?'empty':loadState,usable=ui.environment.active&&ui.environment.enabled;
 return <div {...props} data-ksf-component="data-list" data-selection={selectionMode} className={className}><ContentState state={state} stale={stale} title={state==='empty'?emptyTitle:undefined} onRetry={onRetry}>
  <ul aria-label={label}>{items.map((item,index)=>{const id=ids[index],blocked=!!isDisabled?.(item),chosen=selectionMode==='single'?selectedId===id:selected.has(id),reason=disabledReason?.(item),text=getLabel(item),interactive=selectionMode==='single'||!!onActivate;
   return <li key={id} data-item-id={id} data-selected={chosen||undefined} data-disabled={blocked||undefined}><div className="ksf-data-row">
    {selectionMode==='multiple'&&<Checkbox aria-label={'选择'+text} checked={chosen} disabled={blocked||!ui.environment.enabled} onCheckedChange={next=>{if(!usable||blocked)return;onSelectionChange?.(next?[...selectedIds.filter(x=>x!==id),id]:selectedIds.filter(x=>x!==id),valueChange('selection'));}}/>}
    <div className="ksf-data-row-content">{interactive?<Button variant="ghost" className="ksf-data-title" disabled={blocked} disabledReason={reason} aria-pressed={selectionMode==='single'?chosen:undefined} onActivate={()=>{if(!usable||blocked)return;if(selectionMode==='single')onSelect?.(id,valueChange('selection'));else onActivate?.(id);}} onDoubleClick={()=>{if(usable&&!blocked&&selectionMode==='single')onActivate?.(id);}} onKeyDown={event=>{if(event.key==='Enter'&&selectionMode==='single'&&onActivate&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();if(usable&&!blocked)onActivate(id);}}}>{text}</Button>:<strong>{text}</strong>}{renderItem?.(item)}{blocked&&reason&&<small className="ksf-feedback-description">{reason}</small>}</div>{renderActions&&<div className="ksf-data-row-actions">{renderActions(item)}</div>}
   </div></li>;
  })}</ul>{hasMore&&<Button disabled={!onLoadMore} busy={loadState==='refreshing'} onActivate={onLoadMore}>加载更多</Button>}
 </ContentState></div>;
}

export interface SaveStatusProps extends Omit<HTMLAttributes<HTMLDivElement>,'title'>{view:Pick<SaveView<unknown>,'status'|'dirty'|'pending'|'draftVersion'|'connection'|'error'|'canRetrySameAttempt'>;variant?:'inline'|'detailed';validating?:boolean;savedAt?:string;onRetry?:()=>void;onReconcile?:()=>void;onResolve?:()=>void;actionsDisabled?:boolean}
export function SaveStatus({view,variant='inline',validating=false,savedAt,onRetry,onReconcile,onResolve,actionsDisabled=false,className='',...props}:SaveStatusProps){
 const ui=useUI(),labels={loading:'正在读取',pending:'有未保存修改',saving:'正在保存',saved:view.dirty?'有未保存修改':'已保存',failed:'保存失败',conflict:'版本冲突',unknown:'保存结果待核实'},newer=view.status==='saving'&&view.pending&&view.draftVersion!==view.pending.draftVersion,tone=view.status==='failed'?'danger':view.status==='conflict'||view.status==='unknown'?'warning':view.status==='saved'&&!view.dirty?'success':'neutral';
 const date=savedAt?new Date(savedAt):null,time=date&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(date):null;
 return <div {...props} data-ksf-component="save-status" data-state={view.status} data-variant={variant} className={className}><div className="ksf-save-message" role="status" aria-live={ui.environment.active&&ui.environment.visible?'polite':'off'}><Badge tone={tone}>{validating?'正在检查':labels[view.status]}</Badge>{newer&&<span>仍有新修改</span>}{view.connection==='unavailable'&&<span>连接暂不可用</span>}{time&&view.status==='saved'&&!view.dirty&&<time dateTime={savedAt}>{time}</time>}{variant==='detailed'&&view.error&&<p>{view.error.message}</p>}</div>
  <div className="ksf-save-actions">{view.status==='failed'&&onRetry&&<Button disabled={actionsDisabled||validating} onActivate={onRetry}>重试保存</Button>}{view.status==='unknown'&&onReconcile&&<Button disabled={actionsDisabled||validating} onActivate={onReconcile}>核对原请求</Button>}{view.status==='unknown'&&view.canRetrySameAttempt===true&&onRetry&&<Button disabled={actionsDisabled||validating} onActivate={onRetry}>重试原保存</Button>}{view.status==='conflict'&&onResolve&&<Button disabled={actionsDisabled||validating} onActivate={onResolve}>比较版本</Button>}</div>
 </div>;
}
