import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Text,Heading,InlineCode} from '@ksf/sdk/typography';
import {Link} from '@ksf/sdk/link';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TypographySuffixExample(){const [count,setCount]=useState(0);return <div style={{maxWidth:260}}><Text as='p' ellipsis={{lines:2,expandable:true}} suffix={<Button size='small' variant='text' onClick={()=>setCount(v=>v+1)}>操作{count}</Button>}>{'说明文字可以省略，后续操作始终保留。'.repeat(8)}</Text></div>;}
