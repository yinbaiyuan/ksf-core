import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tag} from '@ksf/sdk/tag';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TagRemoveExample(){const [tags,setTags]=useState(['设计','研究']),next=useRef(1);return <div className='ksf-demo-row'>{tags.map(t=><Tag key={t} onRemove={()=>setTags(tags.filter(v=>v!==t))}>{t}</Tag>)}<Button size='small' onClick={()=>setTags([...tags,'新标签'+next.current++])}>添加</Button></div>;}
