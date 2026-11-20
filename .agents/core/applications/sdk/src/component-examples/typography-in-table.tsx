import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Text,Heading,InlineCode} from '@ksf/sdk/typography';
import {Link} from '@ksf/sdk/link';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TypographyInTableExample(){return <table style={{width:'100%',tableLayout:'fixed',borderCollapse:'collapse',fontSize:13}}><thead><tr><th style={{textAlign:'start'}}>资料名称</th><th style={{width:80}}>状态</th></tr></thead><tbody>{['本周项目研究资料与交付跟进说明','多房间设备配置与联动场景设计','用户访谈记录与待确认问题'].map(name=><tr key={name}><td style={{padding:'10px 4px'}}><Text ellipsis>{name}</Text></td><td>待整理</td></tr>)}</tbody></table>;}
