import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Badge} from '@ksf/sdk/badge';import {Avatar} from '@ksf/sdk/avatar';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function BadgeDynamicExample(){const [count,setCount]=useState(5);return <div className='ksf-demo-row'><Button onClick={()=>setCount(Math.max(0,count-1))}>减少</Button><Badge count={count} showZero/><Button onClick={()=>setCount(count+1)}>增加</Button></div>;}
