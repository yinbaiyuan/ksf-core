import {useState,useRef} from 'react';
import {TextArea} from '@ksf/sdk/text-area';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextAreaStatesExample(){return <div className='ksf-demo-stack'><TextArea label='只读记录' defaultValue='已归档的内容仍可选择复制。' readOnly/><TextArea label='说明' error='请补充说明' required/><TextArea label='暂不可编辑' disabled defaultValue='等待权限'/></div>;}
