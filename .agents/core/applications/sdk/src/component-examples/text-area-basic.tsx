import {useState,useRef} from 'react';
import {TextArea} from '@ksf/sdk/text-area';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextAreaBasicExample(){const [value,setValue]=useState('记录这次讨论的结论。');return <div className='ksf-demo-stack'><TextArea label='工作记录' value={value} onValueChange={setValue} autoSize minRows={3} maxRows={6} maxLength={200} showCount/><output>{value.length} / 200 字</output></div>;}
