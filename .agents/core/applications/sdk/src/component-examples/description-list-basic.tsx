import {useState} from 'react';
import {DescriptionList} from '@ksf/sdk/description-list';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DescriptionListBasicExample(){return <DescriptionList items={[{id:'name',label:'项目',content:'会议空间研究'},{id:'owner',label:'负责人',content:'小林'},{id:'status',label:'状态',content:'进行中'},{id:'updated',label:'更新时间',content:'2026-11-18'},{id:'note',label:'说明',content:'事实、结论和未决事项分别记录。',span:2}]}/>;}
