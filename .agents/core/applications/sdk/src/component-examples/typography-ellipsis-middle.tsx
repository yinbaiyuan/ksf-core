import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Text,Heading,InlineCode} from '@ksf/sdk/typography';
import {Link} from '@ksf/sdk/link';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TypographyEllipsisMiddleExample(){return <div className='ksf-demo-stack' style={{maxWidth:230}}><Text ellipsis={{tailChars:12}}>项目资料/空间规划/2026年度/智能家居交付研究与设备配置说明书.pdf</Text><Text tone='muted' size='small'>按Unicode字符保留尾部，不截断中文代理对。</Text></div>;}
