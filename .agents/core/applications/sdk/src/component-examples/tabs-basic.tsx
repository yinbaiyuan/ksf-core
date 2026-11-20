import {useState,useRef,useId} from 'react';
import {Tabs} from '@ksf/sdk/tabs';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TabsBasicExample(){const [value,setValue]=useState('overview');return <Tabs label='项目资料' value={value} onValueChange={setValue} items={[{id:'overview',label:'概览',content:<p>项目进度与当前结论。</p>},{id:'files',label:'资料',content:<p>本次交付使用的资料。</p>},{id:'later',label:'归档',content:'暂不可用',disabled:true}]}/>;}
