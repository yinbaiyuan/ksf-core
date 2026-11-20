import {AgentActivity} from '@ksf/sdk/agent-activity';

export default function Example(){return <AgentActivity label="等待与取消状态" steps={[{id:'waiting',label:'等待输入',status:'queued'},{id:'cancelled',label:'已取消步骤',status:'cancelled'}]}/>;}
