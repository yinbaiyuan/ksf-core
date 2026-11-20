import {useState,useRef} from 'react';
import {Switch} from '@ksf/sdk/switch';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SwitchBasicExample(){const [checked,setChecked]=useState(true);return <div className='ksf-demo-stack'><div className='ksf-demo-row'><Switch label='自动保存' checked={checked} onCheckedChange={setChecked}/><span>自动保存{checked?'已开启':'已关闭'}</span></div></div>;}
