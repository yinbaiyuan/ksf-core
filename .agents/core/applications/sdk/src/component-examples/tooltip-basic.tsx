import {useState} from 'react';
import {Tooltip} from '@ksf/sdk/tooltip';
import {Button} from '@ksf/sdk/button';
import {TextField} from '@ksf/sdk/text-field';
import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TooltipBasicExample(){const [count,setCount]=useState(0);return <div className='ksf-demo-stack'><Tooltip content='保存当前草稿；也可通过键盘聚焦查看说明'><Button onClick={()=>setCount(v=>v+1)}>保存草稿</Button></Tooltip><output>已保存 {count} 次</output><Tooltip content='此操作暂不可用'><Button disabled>禁用操作</Button></Tooltip></div>;}
