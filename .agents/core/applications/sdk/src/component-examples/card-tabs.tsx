import {useId,useState} from 'react';
import {Card} from '@ksf/sdk/card';import {Tabs} from '@ksf/sdk/tabs';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CardTabsExample(){const uid=useId(),[selected,setSelected]=useState('overview'),items=[{id:'overview',label:'概览',tabId:`${uid}-overview`,panelId:`${uid}-body`},{id:'activity',label:'动态',tabId:`${uid}-activity`,panelId:`${uid}-body`}];return <Card title="资料详情" navigation={<Tabs label="资料内容" size="large" value={selected} onValueChange={setSelected} items={items}/>}><div id={`${uid}-body`} role="tabpanel" tabIndex={0} aria-labelledby={`${uid}-${selected}`}>{selected==='overview'?'项目摘要与交付范围。':'今天更新了两份资料。'}</div></Card>;}
