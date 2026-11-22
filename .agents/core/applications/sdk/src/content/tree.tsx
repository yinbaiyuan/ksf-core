import {forwardRef,useEffect,useRef,useState,type HTMLAttributes,type ReactNode} from 'react';
import {useElementRef,useFormReset,useValue,cx} from '../primitives/state';
import {ControlIcon} from '../primitives/control-icons';
import {useWindowContext} from '../window-context';
import {allTreeNodes,visibleTree,toggleTreeCheck,treeMixed,filterTree,expandTreeChecks,type TreeNode} from './tree-model';
import {TreeBranch} from './tree-branch';
import './tree.css';
export type {TreeNode} from './tree-model';
export interface TreeViewProps extends Omit<HTMLAttributes<HTMLUListElement>,'onSelect'|'defaultValue'> {
 label:string;nodes:readonly TreeNode[];filter?:string;selectedId?:string;defaultSelectedId?:string;onSelect?:(id:string)=>void;
 expandedIds?:readonly string[];defaultExpandedIds?:readonly string[];onExpandedChange?:(ids:string[])=>void;
 checkable?:boolean;checkedIds?:readonly string[];defaultCheckedIds?:readonly string[];onCheckedChange?:(ids:string[])=>void;name?:string;cascadeChecks?:boolean;showLines?:boolean;showLeafIcons?:boolean;showIcons?:boolean;renderLabel?:(node:TreeNode)=>ReactNode;expandOnLabelClick?:boolean;
 blockRows?:boolean;checkOnLabelClick?:boolean;
}
export const TreeView=forwardRef<HTMLUListElement,TreeViewProps>(function TreeView({label,nodes,filter='',selectedId,defaultSelectedId='',onSelect,expandedIds,defaultExpandedIds=[],onExpandedChange,checkable=false,checkedIds,defaultCheckedIds=[],onCheckedChange,name,cascadeChecks=true,showLines=false,showLeafIcons=false,showIcons=false,renderLabel,expandOnLabelClick=false,blockRows=false,checkOnLabelClick=false,className='',...props},ref){
 const flat=allTreeNodes(nodes);if(new Set(flat.map(node=>node.id)).size!==flat.length||flat.some(node=>!node.id||!node.label))throw new Error('TreeView节点需要唯一id和名称。');
 const [selected,setSelected,resetSelected]=useValue(selectedId,defaultSelectedId,onSelect),[expanded,setExpanded,resetExpanded]=useValue<readonly string[]>(expandedIds,defaultExpandedIds,next=>onExpandedChange?.([...next])),[checked,setChecked,resetChecked]=useValue<readonly string[]>(checkedIds,defaultCheckedIds,next=>onCheckedChange?.([...next]));
 const [root,assign]=useElementRef(ref),items=useRef(new Map<string,HTMLLIElement>()),[lastFocus,setLastFocus]=useState<string|null>(null),search=useRef({text:'',at:0}),context=useWindowContext(),interactive=context.active&&context.enabled;
 useFormReset(root,selectedId===undefined||expandedIds===undefined||checkedIds===undefined,()=>{if(selectedId===undefined)resetSelected();if(expandedIds===undefined)resetExpanded();if(checkedIds===undefined)resetChecked();});
 const renderNodes=filterTree(nodes,filter),expandedSet=new Set(filter.trim()?allTreeNodes(renderNodes).filter(node=>node.children?.length).map(node=>node.id):expanded),checkedSet=new Set(checkable&&cascadeChecks?expandTreeChecks(nodes,checked):checked),visible=visibleTree(renderNodes,expandedSet),enabled=visible.filter(item=>!item.node.disabled);
 useEffect(()=>{setLastFocus(null);},[filter]);
 const focusId=enabled.find(item=>item.node.id===lastFocus)?.node.id??enabled.find(item=>item.node.id===selected)?.node.id??(filter.trim()?enabled.find(item=>item.node.label.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()))?.node.id:undefined)??enabled[0]?.node.id;
 const focus=(id:string|undefined)=>{
  if(!id||!interactive)return;const node=items.current.get(id);if(!node)return;
  setLastFocus(id);node.focus({preventScroll:true});
  const row=node.firstElementChild as HTMLElement|null,view=node.ownerDocument.defaultView;if(!row||!view)return;
  for(let parent=node.parentElement;parent&&parent!==node.ownerDocument.body;parent=parent.parentElement){
   if(/auto|scroll/.test(view.getComputedStyle(parent).overflowY)&&parent.scrollHeight>parent.clientHeight){const box=parent.getBoundingClientRect(),rect=row.getBoundingClientRect();if(rect.top<box.top)parent.scrollTop-=box.top-rect.top;else if(rect.bottom>box.bottom)parent.scrollTop+=rect.bottom-box.bottom;break;}
   if(parent===context.root?.current)break;
  }
 };
 const toggle=(node:TreeNode)=>{if(!interactive||filter.trim())return;setExpanded(expandedSet.has(node.id)?expanded.filter(id=>id!==node.id):[...expanded,node.id]);};
 const changeCheck=(node:TreeNode)=>{if(!interactive||node.disabled||node.disableCheckbox)return;setChecked(cascadeChecks?toggleTreeCheck(nodes,checked,node.id):checked.includes(node.id)?checked.filter(id=>id!==node.id):[...checked,node.id]);};
 const render=(list:readonly TreeNode[],parent:string|null=null,level=1,continuations:readonly boolean[]=[]):ReactNode=>list.map((node,index)=>{
  const children=!!node.children?.length,isExpanded=expandedSet.has(node.id),mixed=checkable&&cascadeChecks&&treeMixed(flat.find(value=>value.id===node.id)??node,checkedSet),last=index===list.length-1;
  return <li key={node.id} ref={element=>{if(element)items.current.set(node.id,element);else items.current.delete(node.id);}} role="treeitem" tabIndex={node.id===focusId?0:-1} aria-level={level} aria-expanded={children?isExpanded:undefined} aria-selected={selected===node.id} aria-checked={checkable?(mixed?'mixed':checkedSet.has(node.id)):undefined} aria-disabled={node.disabled||undefined} className="ksf-tree-item" data-selected={selected===node.id||undefined}
   onFocus={event=>{if(event.target===event.currentTarget)setLastFocus(node.id);}}
   onKeyDown={event=>{
    if(!interactive||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
    const at=enabled.findIndex(item=>item.node.id===node.id);let next:string|undefined;
    if(event.key==='ArrowDown')next=enabled[Math.min(enabled.length-1,at+1)]?.node.id;else if(event.key==='ArrowUp')next=enabled[Math.max(0,at-1)]?.node.id;else if(event.key==='Home')next=enabled[0]?.node.id;else if(event.key==='End')next=enabled.at(-1)?.node.id;
    else if(event.key==='ArrowRight'){if(children&&!isExpanded)toggle(node);else if(children)next=node.children?.find(child=>!child.disabled)?.id;}
    else if(event.key==='ArrowLeft'){if(children&&isExpanded)toggle(node);else next=parent??undefined;}
    else if((event.key===' '||event.key==='Enter'&&checkOnLabelClick)&&checkable&&!node.disabled)changeCheck(node);
    else if(event.key==='Enter'||event.key===' '){if(!node.disabled&&node.selectable!==false)setSelected(node.id);}
    else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){const now=Date.now(),text=now-search.current.at<700?search.current.text+event.key:event.key;search.current={text,at:now};next=[...enabled.slice(at+1),...enabled.slice(0,at+1)].find(item=>item.node.label.toLocaleLowerCase().startsWith(text.toLocaleLowerCase()))?.node.id;if(!next)return;}
    else return;event.preventDefault();event.stopPropagation();if(next)focus(next);
   }}>
   <div className="ksf-tree-row" data-level={level} data-last={last||undefined} data-filter-match={!!filter.trim()&&node.label.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())||undefined} onClick={event=>{event.stopPropagation();if(interactive&&!node.disabled){focus(node.id);if(expandOnLabelClick&&children)toggle(node);if(checkable&&checkOnLabelClick)changeCheck(node);else if(node.selectable!==false)setSelected(node.id);}}}>
    <span className="ksf-tree-indent" aria-hidden="true">{continuations.map((connect,depth)=><span key={depth} className="ksf-tree-indent-unit" data-connect={connect||undefined}/>)}</span>
    {children?<button type="button" tabIndex={-1} className="ksf-tree-expander" data-expanded={isExpanded||undefined} aria-label={`${isExpanded?'收起':'展开'}${node.label}`} disabled={!!filter.trim()} onMouseDown={event=>event.preventDefault()} onClick={event=>{event.stopPropagation();toggle(node);focus(node.id);}}><ControlIcon name={showLines?(isExpanded?'MinusSquareOutlined':'PlusSquareOutlined'):'CaretDownFilled'}/></button>:<span className="ksf-tree-expander" aria-hidden="true">{showLines&&(showLeafIcons?<ControlIcon name="FileOutlined"/>:<span className="ksf-tree-leaf-line"/>)}</span>}
    {checkable&&<span className="ksf-tree-check" data-disabled={node.disableCheckbox||undefined} aria-hidden="true" onClick={event=>{event.stopPropagation();if(interactive&&!node.disabled&&!node.disableCheckbox){changeCheck(node);focus(node.id);}}}/>}
    <span className="ksf-tree-label">{showIcons&&node.icon!=null&&<span className="ksf-tree-icon" aria-hidden="true">{node.icon}</span>}<span className="ksf-tree-title">{renderLabel?renderLabel(node):node.label}</span></span>
   </div>
   {children&&<TreeBranch open={isExpanded}>{()=>render(node.children!,node.id,level+1,[...continuations,!last])}</TreeBranch>}
  </li>;
 });
 return <><ul {...props} ref={assign} role="tree" aria-label={label} className={cx('ksf-tree',className)} data-lines={showLines||undefined} data-block-rows={blockRows||undefined}>{render(renderNodes)}</ul>{name&&(checkable?checked:[selected]).filter(Boolean).map(value=><input key={value} type="hidden" name={name} value={value}/>)}</>;
});
