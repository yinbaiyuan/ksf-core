import {useState,useRef,useEffect} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {InlineAlert} from '@ksf/sdk/inline-alert';
export function InlineAlertStatesExample(){const [visible,setVisible]=useState(true);return <div className='ksf-demo-stack'>{visible?<InlineAlert heading='资料尚未提交' tone='warning' onDismiss={()=>setVisible(false)} actions={<Button size='small' onClick={()=>setVisible(false)}>已处理</Button>}>确认资料后继续。</InlineAlert>:<Button onClick={()=>setVisible(true)}>重新显示</Button>}<InlineAlert banner icon={false}>无图标的横幅提示</InlineAlert></div>;}
