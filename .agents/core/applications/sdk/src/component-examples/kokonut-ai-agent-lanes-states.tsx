import {AgentLanes} from '@ksf/sdk/agent-lanes';
export default function Example(){return <div style={{display:'grid',gap:18}}><AgentLanes label="暂无执行通道" lanes={[]} elapsedSeconds={0}/><AgentLanes label="开放步骤" lanes={[{id:'lead',name:'主通道',steps:[{tool:'read',label:'正在读取',start:0}]}]} elapsedSeconds={3}/></div>}
