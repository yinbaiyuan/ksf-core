import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Text,Heading,InlineCode} from '@ksf/sdk/typography';
import {Link} from '@ksf/sdk/link';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TypographyShimmerExample(){const [enabled,setEnabled]=useState(true);return <div className='ksf-demo-stack'><Text shimmer={enabled} strong>正在整理你的资料，稍候即可查看结果。</Text><Button size='small' onClick={()=>setEnabled(v=>!v)}>{enabled?'停止动效':'开启动效'}</Button></div>;}
