import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Transfer} from '@ksf/sdk/transfer';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TransferRichExample(){return <Transfer label='选择审阅资料' options={Array.from({length:18},(_,i)=>({value:String(i),label:'资料 '+(i+1),description:i%2?'需求文档':'设计文件',disabled:i===4}))} defaultValue={['1','3']} renderOption={o=><span><strong>{o.label}</strong><small style={{display:'block'}}>{o.description}</small></span>}/>;}
