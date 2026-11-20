import {useState} from 'react';
import {Table,type TableColumn} from '@ksf/sdk/table';
import {Button} from '@ksf/sdk/button';
import {Tag} from '@ksf/sdk/tag';
import '@ksf/sdk/component-examples/catalog-examples.css';
type Row={id:string;title:string;count:number;status:string};
const rows:Row[]=Array.from({length:18},(_,i)=>({id:String(i),title:`项目资料 ${i+1}`,count:(i*7)%29,status:i%3===0?'完成':'进行中'}));
const columns:TableColumn<Row>[]=[{id:'title',header:'资料名称',cell:row=>row.title,width:150},{id:'count',header:'记录数',cell:row=>row.count,sort:(a,b)=>a.count-b.count,align:'end',width:100},{id:'status',header:'状态',cell:row=><Tag tone={row.status==='完成'?'success':'primary'}>{row.status}</Tag>,filter:{options:[{value:'进行中',label:'进行中'},{value:'完成',label:'完成'}],match:(row,value)=>row.status===value},width:130}];
export function TableStatesExample(){const [loading,setLoading]=useState(false),[empty,setEmpty]=useState(false);return <div className='ksf-demo-stack'><div className='ksf-demo-row'><Button onClick={()=>setLoading(v=>!v)}>切换加载</Button><Button onClick={()=>setEmpty(v=>!v)}>切换空表</Button></div><Table label='固定表头与首列' rows={empty?[]:rows} getId={row=>row.id} columns={columns.map((column,index)=>({...column,fixed:index===0?'start':undefined}))} maxHeight={240} stickyHeader loading={loading} bordered size='small'/></div>;}
