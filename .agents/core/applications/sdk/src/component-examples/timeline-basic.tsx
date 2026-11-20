import {useState} from 'react';
import {Timeline} from '@ksf/sdk/timeline';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TimelineBasicExample(){return <Timeline items={[{id:'one',title:'资料准备',time:'09:00',content:'范围与原始资料已核对。',tone:'success'},{id:'two',title:'开始实施',time:'10:30',content:'组件实现与自动检查。'},{id:'three',title:'待核验',time:'14:00',tone:'warning'}]} pending='等待用户查看效果'/>;}
