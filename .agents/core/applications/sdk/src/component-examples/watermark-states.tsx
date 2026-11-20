import {useState} from 'react';
import {Watermark} from '@ksf/sdk/watermark';
import {Button} from '@ksf/sdk/button';
import {Card} from '@ksf/sdk/card';
import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function WatermarkStatesExample(){const [visible,setVisible]=useState(true);return <div className='ksf-demo-stack'><Button onClick={()=>setVisible(v=>!v)}>切换水印</Button><Watermark content='KSF COMPONENTS' angle={-35} opacity={visible ? .2 : 0} gap={[24,24]}><div className='ksf-demo-box' style={{minHeight:180}}>旋转、密度与透明度由当前应用决定。</div></Watermark></div>;}
