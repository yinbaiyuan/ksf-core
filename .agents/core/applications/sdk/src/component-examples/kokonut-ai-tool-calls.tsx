import {useState} from 'react';
import {ToolCalls, type ToolCall} from '@ksf/sdk/tool-calls';
import {Button} from '@ksf/sdk/button';
import {useLocalDemoTasks} from '@ksf/sdk/component-examples/local-demo-tasks';
export default function Example(){const [calls,setCalls]=useState<ToolCall[]>([{id:'search',name:'web_search',status:'done',runningLabel:'搜索资料',completedLabel:'已搜索资料',inputSummary:'KSF 示例',outputSummary:'3 条本地模拟结果'},{id:'read',name:'read_file',status:'error',inputSummary:'示例内容',error:'模拟解析失败'}]);const {wait}=useLocalDemoTasks();return <div style={{display:'grid',gap:16}}><ToolCalls label="工具调用（模拟）" calls={calls} prompt="请查阅这些示例" answer="本地模拟结果已整理。"/><Button onClick={async()=>{setCalls(cs=>cs.map(c=>c.id==='read'?{...c,status:'ready',error:undefined}:c));try{await wait(700);setCalls(cs=>cs.map(c=>c.id==='read'?{...c,status:'done',outputSummary:'解析完成'}:c));}catch{}}}>模拟重试</Button></div>}
