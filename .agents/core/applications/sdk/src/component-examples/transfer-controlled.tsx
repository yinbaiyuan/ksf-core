import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Transfer} from '@ksf/sdk/transfer';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TransferControlledExample(){const [ids,setIds]=useState<string[]>(['2']);return <div className='ksf-demo-stack'><Transfer label='受控范围' options={Array.from({length:18},(_,i)=>({value:String(i),label:'资料 '+(i+1),description:i%2?'需求文档':'设计文件',disabled:i===4}))} value={ids} onValueChange={setIds}/><output>目标：{ids.join('、')}</output><Button onClick={()=>setIds([])}>重置目标</Button></div>;}
