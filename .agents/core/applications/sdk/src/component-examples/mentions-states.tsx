import {useState,useRef} from 'react';
import {Mentions} from '@ksf/sdk/mentions';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function MentionsStatesExample(){return <div className='ksf-demo-stack'><Mentions label='自定义前缀' prefix='#' options={[{value:'design',label:'设计'},{value:'review',label:'评审'}]} placeholder='输入 # 选择工作类型' autoSize/><Mentions label='禁用提及' options={[]} defaultValue='已归档留言' disabled/></div>;}
