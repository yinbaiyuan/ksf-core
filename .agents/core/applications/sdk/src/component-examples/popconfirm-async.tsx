import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Popconfirm} from '@ksf/sdk/popconfirm';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function PopconfirmAsyncExample(){const [fail,setFail]=useState(true);return <Popconfirm title='提交本次评审？' onConfirm={async signal=>{await new Promise(resolve=>setTimeout(resolve,500));if(signal.aborted)return;if(fail){setFail(false);throw new Error('演示失败');}}}><Button>异步确认（首次失败）</Button></Popconfirm>;}
