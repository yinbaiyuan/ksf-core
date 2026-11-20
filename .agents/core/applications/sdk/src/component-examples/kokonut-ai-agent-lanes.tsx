import {useState} from 'react';
import {AgentLanes, type AgentLane} from '@ksf/sdk/agent-lanes';
import {Slider} from '@ksf/sdk/slider';
const lanes:AgentLane[]=[{id:'lead',name:'主通道',steps:[{tool:'think',label:'拆分问题',start:0,end:1.4},{tool:'write',label:'整理结论',start:10.4,end:13.6}]},{id:'design',name:'界面',summary:'主题与布局已核对',steps:[{tool:'search',label:'查找原版',start:1.6,end:3.3,result:'固定免费来源'},{tool:'read',label:'检查尺寸',start:3.3,end:6.8,result:'尺寸记录完成'}]},{id:'code',name:'接口',summary:'KSF接入边界明确',steps:[{tool:'read',label:'核对公共入口',start:1.7,end:4.5},{tool:'think',label:'整理回调',start:4.5,end:9.6}]}];
export default function Example(){const [elapsed,setElapsed]=useState(8);return <div style={{display:'grid',gap:18,width:'100%'}}><AgentLanes label="并行核对（本地模拟）" lanes={lanes} elapsedSeconds={elapsed} completionText="固定来源与KSF接入已核对。"/><Slider label="演示经过秒数" min={0} max={14} step={.1} value={elapsed} onValueChange={setElapsed}/></div>}
