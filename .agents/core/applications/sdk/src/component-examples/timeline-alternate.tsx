import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Timeline} from '@ksf/sdk/timeline';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TimelineAlternateExample(){return <Timeline items={[{id:'a',title:'建立任务',time:'09:00',content:'明确范围'},{id:'b',title:'完成设计',time:'10:30',tone:'success',content:'已通过工程检查'},{id:'c',title:'待用户评审',time:'11:00',tone:'warning'}]} placement='alternate'/>;}
