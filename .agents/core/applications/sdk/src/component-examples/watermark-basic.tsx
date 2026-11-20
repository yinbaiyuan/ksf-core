import {useState} from 'react';
import {Watermark} from '@ksf/sdk/watermark';
import {Button} from '@ksf/sdk/button';
import {Card} from '@ksf/sdk/card';
import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function WatermarkBasicExample(){const [count,setCount]=useState(0);return <Watermark content={['KSF 工作资料','仅供项目讨论']}><div className='ksf-demo-box' style={{minHeight:220}}><h3>项目方案</h3><p>水印覆盖当前区域，不阻挡内容交互。</p><Button onClick={()=>setCount(v=>v+1)}>已查看 {count} 次</Button></div></Watermark>;}
