import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DescriptionList} from '@ksf/sdk/description-list';import {Avatar} from '@ksf/sdk/avatar';import {Tag} from '@ksf/sdk/tag';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DescriptionListComplexExample(){return <DescriptionList bordered items={[{id:'owner',label:'负责人',content:<Avatar name='小林'/>},{id:'status',label:'状态',content:<Tag tone='success'>已就绪</Tag>},{id:'action',label:'操作',content:<Button size='small'>查看记录</Button>,span:2}]}/>;}
