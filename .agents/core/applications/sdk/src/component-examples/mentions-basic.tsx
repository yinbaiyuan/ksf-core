import {useState,useRef} from 'react';
import {Mentions} from '@ksf/sdk/mentions';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function MentionsBasicExample(){const [value,setValue]=useState('');return <div className='ksf-demo-stack'><Mentions label='协作留言' options={[{value:'xiaolin',label:'小林'},{value:'xiaozhou',label:'小周'},{value:'archive',label:'归档机器人',disabled:true}]} value={value} onValueChange={setValue} placeholder='输入 @ 选择协作者'/><output>{value||'尚未留言'}</output></div>;}
