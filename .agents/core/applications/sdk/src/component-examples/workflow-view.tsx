import type {LocalWorkflowState} from './local-demo-tasks';
import {AgentActivity} from '../agent-activity';
import {InlineAlert} from '../inline-alert';
export function DemoWorkflowStatus({state,label='本地演示进度'}:{state:LocalWorkflowState;label?:string}) {
 return <><AgentActivity label={label} steps={state.labels.map((name,index)=>({id:String(index),label:name,status:state.phase==='done'||index<state.step?'done':index===state.step&&state.phase==='running'?'running':index===state.step&&state.phase==='error'?'error':state.phase==='cancelled'&&index===state.step?'cancelled':'queued'}))}/>{state.message&&<InlineAlert tone={state.phase==='error'?'error':state.phase==='done'?'success':'info'}>{state.message}</InlineAlert>}</>;
}
