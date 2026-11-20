import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Accordion} from '@ksf/sdk/accordion';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AccordionExtraExample(){const [count,setCount]=useState(0);return <Accordion items={[{id:'a',title:'项目资料',content:'展开后的资料内容',extra:<Button size='small' variant='text' onClick={()=>setCount(count+1)}>操作 {count}</Button>}]}/>;}
