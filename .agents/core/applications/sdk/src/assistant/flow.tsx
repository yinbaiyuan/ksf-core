import {forwardRef, useRef, useState} from 'react';
import {Button} from '../button';
import {Switch} from '../switch';
import {Popconfirm} from '../popconfirm';
import {Editable} from './inputs';
import {useMotionActivity} from '../motion-activity';
import {useElementRef} from '../primitives/state';
import './assistant.css';

export type ActivityStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';
const statusLabel = (status: ActivityStatus) => ({queued:'等待中',running:'运行中',done:'已完成',error:'失败',cancelled:'已取消'}[status]);
const percent = (value: number) => Number.isFinite(value) ? Math.max(0,Math.min(100,value)) : 0;
export interface ActivityStep {id: string; label: string; status: ActivityStatus; detail?: string; logs?: readonly string[]; duration?: string; progress?: number}
export interface AgentActivityProps {label: string; steps: readonly ActivityStep[]; elapsed?: string; summary?: string; onRetry?: (id: string) => void}
export const AgentActivity = forwardRef<HTMLDivElement, AgentActivityProps>(function AgentActivity({label, steps, elapsed, summary, onRetry}, ref) {
  const activity = useMotionActivity<HTMLDivElement>(), [, assign] = useElementRef(ref);
  return <div ref={node=>{activity.ref.current=node;return assign(node);}} className="ksf-assistant ksf-agent-activity" data-motion-active={activity.active} role="region" aria-label={label}>
    <div className="ksf-assistant-heading"><strong>{label}</strong>{elapsed&&<span className="ksf-assistant-mono">{elapsed}</span>}</div>
    <ol>{steps.map(step=><li key={step.id} data-status={step.status}><span className="ksf-activity-dot" aria-hidden="true">{step.status==='done'?'✓':step.status==='error'?'!':step.status==='cancelled'?'×':''}</span><div><div className="ksf-assistant-heading"><strong>{step.label}</strong><small>{statusLabel(step.status)}{step.duration?` · ${step.duration}`:''}</small></div>{step.detail&&<p>{step.detail}</p>}{step.progress!==undefined&&step.status==='running'&&<progress max={100} value={percent(step.progress)} aria-label={`${step.label}进度`}/>}{step.logs?.length ? <details><summary>查看记录 · {step.logs.length}行</summary><pre>{step.logs.join('\n')}</pre></details> : null}{step.status==='error'&&onRetry&&<Button size="small" onClick={()=>onRetry(step.id)}>重试此步骤</Button>}</div></li>)}</ol>
    {summary&&<p className="ksf-activity-summary" role="status">{summary}</p>}{!steps.length&&<p className="ksf-assistant-muted">暂无执行步骤</p>}
  </div>;
});

export interface ConversationBranch {id: string; title: string; parentId?: string; excerpt?: string; messageCount?: number}
export interface ConversationBranchesProps {label: string; branches: readonly ConversationBranch[]; activeId?: string; onActiveChange: (id: string) => void}
export const ConversationBranches = forwardRef<HTMLDivElement, ConversationBranchesProps>(function ConversationBranches({label, branches, activeId, onActiveChange}, ref) {
  const depth = (branch: ConversationBranch) => {let count=0,parent=branch.parentId;const seen=new Set([branch.id]);while(parent&&!seen.has(parent)&&count<12){seen.add(parent);const item=branches.find(branch=>branch.id===parent);if(!item)break;count++;parent=item.parentId;}return count;};
  return <div ref={ref} className="ksf-assistant ksf-conversation-branches" role="group" aria-label={label}><strong>{label}</strong><div>{branches.map(branch=><button key={branch.id} type="button" aria-pressed={activeId===branch.id} style={{marginInlineStart:depth(branch)*18}} onClick={()=>onActiveChange(branch.id)} onKeyDown={event=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const buttons=Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button')),at=buttons.indexOf(event.currentTarget);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}}><span>{branch.parentId?'⑂':'◉'}</span><span><strong>{branch.title}</strong>{branch.excerpt&&<small>{branch.excerpt}</small>}{branch.messageCount!==undefined&&<small>{branch.messageCount}条消息</small>}</span>{activeId===branch.id&&<span aria-hidden="true">✓</span>}</button>)}</div>{!branches.length&&<p className="ksf-assistant-muted">暂无会话分支</p>}</div>;
});

export interface AgentLane {id: string; name: string; status: ActivityStatus; steps?: readonly string[]; progress?: number; output?: string}
export interface AgentLanesProps {label: string; lanes: readonly AgentLane[]; onInspect?: (id: string) => void; onCancel?: (id: string) => void}
export const AgentLanes = forwardRef<HTMLDivElement, AgentLanesProps>(function AgentLanes({label, lanes, onInspect, onCancel}, ref) {
  const activity=useMotionActivity<HTMLDivElement>(),[,assign]=useElementRef(ref);
  return <div ref={node=>{activity.ref.current=node;return assign(node);}} className="ksf-assistant ksf-agent-lanes" role="region" aria-label={label} data-motion-active={activity.active}><div className="ksf-assistant-heading"><strong>{label}</strong><span>{lanes.length}条执行通道</span></div><div>{lanes.map(lane=><section key={lane.id} aria-label={lane.name} data-status={lane.status}><div className="ksf-assistant-heading"><strong>{lane.name}</strong><span className="ksf-assistant-badge" data-tone={lane.status==='error'?'danger':lane.status==='done'?'success':'primary'}>{statusLabel(lane.status)}</span></div>{lane.progress!==undefined&&<progress max={100} value={percent(lane.progress)} aria-label={`${lane.name}进度`}/>}<ol>{lane.steps?.map((step,index)=><li key={index}>{step}</li>)}</ol>{lane.output&&<p>{lane.output}</p>}<div className="ksf-assistant-actions">{onInspect&&<Button size="small" variant="text" onClick={()=>onInspect(lane.id)}>查看详情</Button>}{onCancel&&lane.status==='running'&&<Button size="small" onClick={()=>onCancel(lane.id)}>取消此通道</Button>}</div></section>)}</div>{!lanes.length&&<p className="ksf-assistant-muted">暂无执行通道</p>}</div>;
});

export interface QueuedMessage {id: string; text: string; status: 'queued' | 'sending' | 'sent' | 'error'; error?: string}
export interface MessageQueueProps {
  label: string; items: readonly QueuedMessage[]; paused?: boolean; onPauseChange?: (paused: boolean) => void;
  onReorder?: (ids: readonly string[]) => void; onRemove?: (id: string) => void; onRetry?: (id: string) => void; onEdit?: (id: string, text: string) => void | Promise<void>;
}
export const MessageQueue = forwardRef<HTMLDivElement, MessageQueueProps>(function MessageQueue({label, items, paused=false, onPauseChange, onReorder, onRemove, onRetry, onEdit}, ref) {
  const dragged=useRef<string|null>(null);
  const move=(id:string,target:string)=>{if(!onReorder||id===target||items.find(item=>item.id===id)?.status!=='queued'||items.find(item=>item.id===target)?.status!=='queued')return;const order=items.map(item=>item.id),from=order.indexOf(id),to=order.indexOf(target);if(from<0||to<0)return;order.splice(from,1);order.splice(to,0,id);onReorder(order);};
  return <div ref={ref} className="ksf-assistant ksf-message-queue" role="region" aria-label={label}><div className="ksf-assistant-heading"><strong>{label} · {items.length}</strong>{onPauseChange&&<Button size="small" aria-pressed={paused} onClick={()=>onPauseChange(!paused)}>{paused?'继续队列':'暂停队列'}</Button>}</div><ol>{items.map((item,index)=><li key={item.id} data-status={item.status} onDragOver={event=>{if(dragged.current&&item.status==='queued')event.preventDefault();}} onDrop={event=>{event.preventDefault();if(dragged.current)move(dragged.current,item.id);dragged.current=null;}}>
    <div className="ksf-assistant-heading"><span>{index+1}. {item.status==='queued'?'等待发送':item.status==='sending'?'正在发送':item.status==='sent'?'已发送':'发送失败'}</span>{onReorder&&<button type="button" className="ksf-queue-handle" aria-label={`拖动消息${index+1}调整顺序`} disabled={item.status!=='queued'} draggable={item.status==='queued'} onDragStart={event=>{dragged.current=item.id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-ksf-local-queue','move');}} onDragEnd={()=>{dragged.current=null;}}>⠿</button>}</div>
    {onEdit&&item.status==='queued'?<Editable label={`消息${index+1}`} value={item.text} onSave={text=>onEdit(item.id,text)}/>:<p>{item.text}</p>}{item.error&&<p role="alert">{item.error}</p>}
    <div className="ksf-assistant-actions">{onReorder&&item.status==='queued'&&<><Button size="small" variant="text" aria-label={`上移消息${index+1}`} disabled={index===0||items[index-1].status!=='queued'} onClick={()=>move(item.id,items[index-1].id)}>↑</Button><Button size="small" variant="text" aria-label={`下移消息${index+1}`} disabled={index===items.length-1||items[index+1].status!=='queued'} onClick={()=>move(item.id,items[index+1].id)}>↓</Button></>}{onRetry&&item.status==='error'&&<Button size="small" onClick={()=>onRetry(item.id)}>重试发送</Button>}{onRemove&&(item.status==='queued'||item.status==='error')&&<Button size="small" variant="text" aria-label={`移除消息${index+1}`} onClick={()=>onRemove(item.id)}>移除</Button>}</div>
  </li>)}</ol>{!items.length&&<p className="ksf-assistant-muted">队列为空</p>}</div>;
});

export interface MemoryItem {id: string; title: string; description?: string; scope: 'session' | 'application' | 'project'; enabled: boolean; updatedLabel?: string}
export interface MemoryListProps {label: string; items: readonly MemoryItem[]; onEnabledChange: (id: string, enabled: boolean) => void; onEdit?: (id: string) => void; onRemove?: (id: string) => void | Promise<void>}
export const MemoryList = forwardRef<HTMLDivElement, MemoryListProps>(function MemoryList({label, items, onEnabledChange, onEdit, onRemove}, ref) {
  const [scope,setScope]=useState('all'),labels={session:'本次会话',application:'当前应用',project:'当前项目'};
  const shown=items.filter(item=>scope==='all'||item.scope===scope);
  return <div ref={ref} className="ksf-assistant ksf-memory-list" role="region" aria-label={label}><div className="ksf-assistant-heading"><strong>{label}</strong><select aria-label="记忆范围" value={scope} onChange={event=>setScope(event.currentTarget.value)}><option value="all">全部范围</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><ul>{shown.map(item=><li key={item.id} data-enabled={item.enabled}><div className="ksf-assistant-heading"><strong>{item.title}</strong><Switch label={`使用记忆：${item.title}`} checked={item.enabled} onCheckedChange={enabled=>onEnabledChange(item.id,enabled)}/></div>{item.description&&<p>{item.description}</p>}<div className="ksf-assistant-heading"><small>{labels[item.scope]}{item.updatedLabel?` · ${item.updatedLabel}`:''}</small><div className="ksf-assistant-actions">{onEdit&&<Button size="small" variant="text" onClick={()=>onEdit(item.id)}>编辑</Button>}{onRemove&&<Popconfirm title="移除此条记忆？" description="移除操作由应用处理，组件不修改真实记忆库。" onConfirm={()=>onRemove(item.id)} danger><Button size="small" variant="text">移除</Button></Popconfirm>}</div></div></li>)}</ul>{!shown.length&&<p className="ksf-assistant-muted">当前范围暂无记忆</p>}</div>;
});
