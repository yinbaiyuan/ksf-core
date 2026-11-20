import {useState,useRef} from 'react';
import {TagsInput} from '@ksf/sdk/tags-input';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TagsInputBasicExample(){const [value,setValue]=useState<string[]>(['design']);return <div className='ksf-demo-stack'><TagsInput label='工作标签' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} value={value} onValueChange={setValue} maxTags={3} placeholder='输入后按 Enter'/><output>{value.join('、')}</output></div>;}
