import {forwardRef} from 'react';
import Source from './fidelity/kokonut/ai-branches';
import {FidelityScope} from './fidelity/scope';
import './fidelity/styles/ai-branches.css';
export interface ConversationMessage{id:string;role:'user'|'assistant';text:string;parentId?:string}
export interface ConversationBranchesProps{label:string;messages:readonly ConversationMessage[];activeId?:string;onActiveChange?:(id:string)=>void;writingId?:string;onEditRequest?:(id:string,text:string)=>void}
export const ConversationBranches=forwardRef<HTMLDivElement,ConversationBranchesProps>(function ConversationBranches({label,messages,...props},ref){const ids=new Set<string>();let invalid=false;const byId=new Map(messages.map(message=>[message.id,message]));for(const message of messages){if(!message.id||message.id==='root'||ids.has(message.id)||message.parentId&&!byId.has(message.parentId))invalid=true;ids.add(message.id);const seen=new Set([message.id]);let parent=message.parentId;while(parent){if(seen.has(parent)){invalid=true;break;}seen.add(parent);parent=byId.get(parent)?.parentId;}}if(invalid)return <div ref={ref} role="alert">会话消息存在重复、缺失父级或循环关系。</div>;return <FidelityScope module="ai-branches"><Source {...props} title={label} controlRef={ref} messages={messages.map(message=>({id:message.id,role:message.role,text:message.text,parent:message.parentId}))}/></FidelityScope>;});

export {ConversationBranches as ConversationTree} from './assistant/flow';
export type {ConversationBranch} from './assistant/flow';
