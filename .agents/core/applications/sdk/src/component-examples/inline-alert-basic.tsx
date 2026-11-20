import {useState,useRef,useEffect} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {InlineAlert} from '@ksf/sdk/inline-alert';
export function InlineAlertBasicExample(){return <div className='ksf-demo-stack'>{(['info','success','warning','error'] as const).map(tone=><InlineAlert key={tone} tone={tone} heading={{info:'更新提示',success:'已保存',warning:'请检查',error:'提交失败'}[tone]}>当前状态的说明文字。</InlineAlert>)}</div>;}
