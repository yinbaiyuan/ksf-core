import {useState} from 'react';
import {Table,type TableColumn} from '@ksf/sdk/table';
import {Button} from '@ksf/sdk/button';
import {Tag} from '@ksf/sdk/tag';
import '@ksf/sdk/component-examples/catalog-examples.css';
type Row={id:string;title:string;count:number;status:string};
const rows:Row[]=Array.from({length:18},(_,i)=>({id:String(i),title:`项目资料 ${i+1}`,count:(i*7)%29,status:i%3===0?'完成':'进行中'}));
const columns:TableColumn<Row>[]=[{id:'title',header:'资料名称',cell:row=>row.title,width:150},{id:'count',header:'记录数',cell:row=>row.count,sort:(a,b)=>a.count-b.count,align:'end',width:100},{id:'status',header:'状态',cell:row=><Tag tone={row.status==='完成'?'success':'primary'}>{row.status}</Tag>,filter:{options:[{value:'进行中',label:'进行中'},{value:'完成',label:'完成'}],match:(row,value)=>row.status===value},width:130}];
export function TableBasicExample(){return <Table label='资料总览' rows={rows.slice(0,5)} getId={row=>row.id} columns={columns}/>;}
