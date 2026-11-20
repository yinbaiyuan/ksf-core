import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Text,Heading,InlineCode} from '@ksf/sdk/typography';
import {Link} from '@ksf/sdk/link';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TypographyEllipsisControlledExample(){const [expanded,setExpanded]=useState(false);return <div className='ksf-demo-stack' style={{maxWidth:280}}><Text as='p' ellipsis={{lines:2,expandable:true,expanded,onExpandedChange:setExpanded}}>{'展开状态由应用管理，可与其他操作同步。'.repeat(12)}</Text><Button size='small' onClick={()=>setExpanded(v=>!v)}>{expanded?'从外部收起':'从外部展开'}</Button></div>;}
