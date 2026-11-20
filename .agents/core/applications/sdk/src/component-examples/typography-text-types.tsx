import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Text,Heading,InlineCode} from '@ksf/sdk/typography';
import {Link} from '@ksf/sdk/link';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TypographyTextTypesExample(){return <div className='ksf-demo-stack'><Text>常规文字</Text><Text tone='muted'>辅助文字</Text><Text tone='success'>成功状态</Text><Text tone='warning'>警告状态</Text><Text tone='danger'>危险状态</Text><div className='ksf-demo-row'><Text strong>加粗</Text><Text italic>斜体</Text><Text underline>下划线</Text><Text deleted>删除线</Text><Text mark>标记</Text><Text keyboard>⌘ K</Text><InlineCode>sdk.mount()</InlineCode><Link href='#text-types' onClick={event=>event.preventDefault()}>文字链接</Link></div></div>;}
