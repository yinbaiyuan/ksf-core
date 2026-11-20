import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Text,Heading,InlineCode} from '@ksf/sdk/typography';
import {Link} from '@ksf/sdk/link';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TypographyCopyableExample(){const [last,setLast]=useState('尚未触发');return <div className='ksf-demo-stack'><Text copyable label='公开说明'>可以复制的普通说明</Text><Text copyable={{text:'KSF组件库',onCopy:async text=>{await navigator.clipboard.writeText(text);setLast(text);}}} label='指定内容'>复制固定内容（由应用处理）</Text><output>{last}</output></div>;}
