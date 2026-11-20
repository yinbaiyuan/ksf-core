import {useState} from 'react';
import {Tag} from '@ksf/sdk/tag';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TagStatesExample(){const [selected,setSelected]=useState(false);return <div className='ksf-demo-stack'><Tag checkable selected={selected} onSelectedChange={setSelected}>关注此项目</Tag><Tag disabled onRemove={()=>{}}>不可删除</Tag><output>{selected?'已关注':'未关注'}</output></div>;}
