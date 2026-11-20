import {useState} from 'react';
import {Accordion} from '@ksf/sdk/accordion';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AccordionStatesExample(){return <Accordion multiple appearance='plain' defaultValue={['draft']} items={[{id:'draft',title:'保留草稿',content:<input aria-label='折叠中的草稿' placeholder='收起再打开后仍保留'/>},{id:'notes',title:'补充说明',content:<p>多个区块可同时展开，默认不销毁内容。</p>,extra:<span className='ksf-demo-muted'>2条</span>}]}/>;}
