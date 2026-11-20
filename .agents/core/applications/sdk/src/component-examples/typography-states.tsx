import {useState,type SVGProps} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Text,Heading} from '@ksf/sdk/typography';
export function TypographyStatesExample(){const [value,setValue]=useState('这是一段可编辑、可复制的中文说明。');return <div className='ksf-demo-stack'><Text as='p' editable copyable label='项目说明' value={value} onValueChange={setValue}/><Text as='p' ellipsis={{lines:2,expandable:true}}>{'较长的正文通过行数约束展示，展开后仍保留完整原文。'.repeat(12)}</Text><div className='ksf-demo-row'><Text strong>重点</Text><Text mark>标记</Text><Text deleted>移除内容</Text><Text keyboard>⌘ K</Text><Text tone='success'>已完成</Text><Text tone='warning'>需注意</Text><Text tone='danger'>未通过</Text></div></div>;}
