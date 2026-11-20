import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Dialog} from '@ksf/sdk/dialog';import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DialogDangerExample(){const [open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>危险操作</Button><Dialog open={open} onClose={()=>setOpen(false)} title='危险操作' danger confirmLabel='移除'><p>这里只演示确认反馈。</p></Dialog></>;}
