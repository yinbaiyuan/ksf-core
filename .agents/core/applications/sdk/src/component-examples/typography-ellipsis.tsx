import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Text,Heading,InlineCode} from '@ksf/sdk/typography';
import {Link} from '@ksf/sdk/link';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TypographyEllipsisExample(){return <div style={{maxWidth:280}} className='ksf-demo-stack'><Text as='p' ellipsis>{'单行文案超过当前容器后省略。'.repeat(8)}</Text><Text as='p' ellipsis={{lines:3,expandable:true}}>{'多行内容可以展开查看完整说明，保留中文与标点。'.repeat(10)}</Text></div>;}
