import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Transfer} from '@ksf/sdk/transfer';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TransferCustomExample(){return <Transfer label='选择审阅资料' options={Array.from({length:18},(_,i)=>({value:String(i),label:'资料 '+(i+1),description:i%2?'需求文档':'设计文件',disabled:i===4}))} defaultValue={['1','3']} titles={['待审资料','本轮审阅']} actions={['加入','移出']} footer={side=><small>{side==='source'?'来源保留在本机':'已选择的审阅范围'}</small>}/>;}
