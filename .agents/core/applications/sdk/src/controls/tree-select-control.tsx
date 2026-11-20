import {forwardRef,useEffect,useId,useRef,useState,type ButtonHTMLAttributes,type KeyboardEvent,type ReactNode} from 'react';
import {useValue,useElementRef,useFormReset} from '../primitives/state';
import {AnchoredLayer} from '../primitives/layer';
import {EmptyIllustration} from '../primitives/empty-illustration';
import {useWindowContext} from '../window-context';
import {usePickerPresence} from '../date/picker-presence';
import {TreeView,type TreeNode} from '../content/tree';
import {allTreeNodes,filterTree,expandTreeChecks,toggleTreeCheck} from '../content/tree-model';
import {FieldShell,type FieldPresentation} from './inputs';
import {ChoiceTrigger} from './choice-trigger';
import './extended-inputs.css';

type TreeSelection={multiple?:false;value?:string;defaultValue?:string;onValueChange?:(value:string)=>void}|{multiple:true;value?:readonly string[];defaultValue?:readonly string[];onValueChange?:(value:string[])=>void};
export type TreeSelectProps=Omit<ButtonHTMLAttributes<HTMLButtonElement>,'value'|'defaultValue'|'onChange'>&FieldPresentation&TreeSelection&{
 nodes:readonly TreeNode[];placeholder?:string;clearable?:boolean;searchable?:boolean;leafOnly?:boolean;cascadeChecks?:boolean;maxVisibleTags?:number;renderSelection?:(nodes:readonly TreeNode[])=>ReactNode;
 expandedIds?:readonly string[];defaultExpandedIds?:readonly string[];defaultExpandAll?:boolean;onExpandedChange?:(ids:string[])=>void;showLines?:boolean;showLeafIcons?:boolean;showIcons?:boolean;
};
export const TreeSelect=forwardRef<HTMLButtonElement,TreeSelectProps>(function TreeSelect({nodes,multiple=false,value,defaultValue,onValueChange,label,description,error,variant='outlined',status='default',size='medium',placeholder='请选择',clearable=false,searchable=multiple,leafOnly=false,cascadeChecks=false,maxVisibleTags=Infinity,renderSelection,expandedIds,defaultExpandedIds,defaultExpandAll=false,onExpandedChange,showLines=false,showLeafIcons=false,showIcons=false,id:providedId,name,className='',onClick,...props},ref){
 const generated=useId(),id=providedId??generated,flat=allTreeNodes(nodes),initialExpansion=useRef(defaultExpandedIds??(defaultExpandAll?flat.filter(node=>node.children?.length).map(node=>node.id):[]));
 const [current,setCurrent,reset]=useValue<string|readonly string[]>(value,defaultValue??(multiple?[]:''),next=>{if(multiple)(onValueChange as ((values:string[])=>void)|undefined)?.(Array.isArray(next)?[...next]:[]);else(onValueChange as ((value:string)=>void)|undefined)?.(typeof next==='string'?next:'');});
 const [expanded,setExpanded,resetExpanded]=useValue<readonly string[]>(expandedIds,initialExpansion.current,next=>onExpandedChange?.([...next])),[open,setOpen]=useState(false),[query,setQuery]=useState(''),[button,assign]=useElementRef(ref),anchor=useRef<HTMLDivElement>(null),tree=useRef<HTMLUListElement|null>(null),pendingTreeFocus=useRef(false),pendingReveal=useRef(false),context=useWindowContext();
 const enabled=!props.disabled&&context.active&&context.enabled,visible=usePickerPresence(open,enabled,anchor),values=typeof current==='string'?(current?[current]:[]):current,selectedNodes=values.map((value):TreeNode=>flat.find(node=>node.id===value)??{id:value,label:value}),selectionText=selectedNodes.map(node=>node.label).join('、');
 const prepare=(list:readonly TreeNode[]):TreeNode[]=>list.map(node=>({...node,selectable:leafOnly&&node.children?.length?false:node.selectable,disableCheckbox:node.disableCheckbox||leafOnly&&!!node.children?.length,children:node.children?prepare(node.children):undefined})),prepared=prepare(nodes),preparedFlat=allTreeNodes(prepared),filtered=filterTree(prepared,query),limit=Number.isFinite(maxVisibleTags)?Math.max(1,Math.trunc(maxVisibleTags)):selectedNodes.length;
 useEffect(()=>{if(!enabled){setOpen(false);setQuery('');}},[enabled]);
 useEffect(()=>{if(!visible&&!open)setQuery('');},[visible,open]);
 useFormReset(button,value===undefined,()=>{reset();if(expandedIds===undefined)resetExpanded();setOpen(false);setQuery('');},props.form);
 const focusTree=()=>{const target=tree.current?.querySelector<HTMLElement>('[role=treeitem][tabindex="0"]');if(target){pendingTreeFocus.current=false;target.focus({preventScroll:true});}else pendingTreeFocus.current=true;};
 const close=(restore=false)=>{setOpen(false);if(restore&&enabled)button.current?.focus({preventScroll:true});};
 const begin=(keyboard=false)=>{if(!enabled)return;pendingReveal.current=true;setQuery('');setOpen(true);if(keyboard)pendingTreeFocus.current=true;};
 const selectValues=(next:readonly string[])=>{if(!enabled)return;const filtered=leafOnly?next.filter(id=>!flat.find(node=>node.id===id)?.children?.length):next;if(filtered.length!==values.length||filtered.some((id,index)=>id!==values[index]))setCurrent([...filtered]);};
 const choose=(id:string)=>{const node=preparedFlat.find(node=>node.id===id);if(!enabled||!node||node.disabled||node.selectable===false)return;if(multiple){if(node.disableCheckbox)return;selectValues(cascadeChecks?toggleTreeCheck(prepared,values,id):values.includes(id)?values.filter(value=>value!==id):[...values,id]);setQuery('');}else{if(current!==id)setCurrent(id);close(true);}};
 const navigate=(event:KeyboardEvent<HTMLElement>)=>{
  if(!enabled||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
  if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close(true);}
  else if(event.key==='ArrowDown'){event.preventDefault();if(!open)begin(true);else focusTree();}
  else if(event.key==='Enter'&&open){event.preventDefault();const needle=query.trim().toLocaleLowerCase(),match=preparedFlat.find(node=>!node.disabled&&node.selectable!==false&&(!multiple||!node.disableCheckbox)&&(needle?node.label.toLocaleLowerCase().includes(needle):values.includes(node.id)))??(!needle?preparedFlat.find(node=>!node.disabled&&node.selectable!==false&&(!multiple||!node.disableCheckbox)):undefined);if(match)choose(match.id);}
  else if(event.key==='Backspace'&&multiple&&!query&&values.length){event.preventDefault();selectValues(values.slice(0,-1));}
  else if(event.key==='Tab')close();
 };
 const describedBy=[props['aria-describedby'],description?`${id}-help`:'',error?`${id}-error`:''].filter(Boolean).join(' ')||undefined;
 return <FieldShell {...{id,label,description,error,variant,status}}><div ref={anchor} className="ksf-choice-anchor">
  <ChoiceTrigger {...{id,label,size,placeholder,searchable,query,describedBy}} open={open&&enabled} disabled={props.disabled} invalid={!!error||status==='error'}
   selected={renderSelection?renderSelection(selectedNodes):selectionText} selectedText={selectionText} panelId={`${id}-panel`} buttonRef={assign} buttonProps={{...props,className,title:props.title??selectionText}} onQuery={setQuery} onNavigate={navigate}
   onToggle={event=>{onClick?.(event);if(!event.defaultPrevented&&enabled)open?close():begin();}}
   onClear={clearable&&values.length?()=>{if(enabled){if(multiple)selectValues([]);else setCurrent('');close(true);}}:undefined}
   tags={multiple&&!renderSelection?selectedNodes.slice(0,limit).map(node=>({id:node.id,label:node.label,disabled:node.disabled})):undefined}
   overflowCount={multiple&&!renderSelection?Math.max(0,selectedNodes.length-limit):0} onRemoveTag={id=>selectValues(values.filter(value=>value!==id))}/>
  <AnchoredLayer anchor={anchor} open={visible} onClose={()=>close()} onBlur={event=>{const target=event.relatedTarget as Node|null;if(target&&!event.currentTarget.contains(target)&&!anchor.current?.contains(target))close();}}
   matchWidth gap={4} role="dialog" id={`${id}-panel`} aria-label={`${label??'树形'}选项`} aria-hidden={!open||undefined} inert={!open||undefined} data-closing={!open||undefined} className="ksf-choice-popup ksf-tree-select-panel">
   {filtered.length?<div className="ksf-tree-select-viewport"><TreeView ref={node=>{tree.current=node;if(node&&pendingReveal.current){pendingReveal.current=false;const viewport=node.parentElement,row=node.querySelector<HTMLElement>('[data-selected]>.ksf-tree-row');if(viewport&&row){const top=row.offsetTop,bottom=top+row.offsetHeight;if(top<viewport.scrollTop+8)viewport.scrollTop=top-8;else if(bottom>viewport.scrollTop+viewport.clientHeight-8)viewport.scrollTop=bottom-viewport.clientHeight+8;}}if(node&&pendingTreeFocus.current){pendingTreeFocus.current=false;node.querySelector<HTMLElement>('[role=treeitem][tabindex="0"]')?.focus({preventScroll:true});}}} filter={query} label={`${label??'树形'}选项`} nodes={prepared}
    expandedIds={expanded} onExpandedChange={next=>{if(enabled)setExpanded(next);}} selectedId={typeof current==='string'?current:undefined} onSelect={choose} blockRows showLines={showLines} showLeafIcons={showLeafIcons} showIcons={showIcons}
    checkable={multiple} checkOnLabelClick={multiple} cascadeChecks={cascadeChecks} checkedIds={cascadeChecks?expandTreeChecks(prepared,values):values} onCheckedChange={next=>{selectValues(next);setQuery('');}}/></div>:<div className="ksf-choice-empty"><EmptyIllustration/><span>暂无数据</span></div>}
  </AnchoredLayer>
 </div>{name&&values.map(id=><input key={id} type="hidden" name={name} value={id} form={props.form} disabled={props.disabled}/>)}</FieldShell>;
});
