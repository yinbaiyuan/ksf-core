import {useState} from 'react';
import {Accordion} from '@ksf/sdk/accordion';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AccordionBasicExample(){return <Accordion defaultValue={['scope']} items={[{id:'scope',title:'交付范围',content:<p>首版覆盖常用能力与必要边界。</p>},{id:'source',title:'参考来源',content:<p>记录每个组件的目标与实际采用版本。</p>},{id:'later',title:'后续能力',content:'等待确认',disabled:true}]}/>;}
