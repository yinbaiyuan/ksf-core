import {useState} from 'react';
import {BorderBeam} from '@ksf/sdk/border-beam';
import {Button} from '@ksf/sdk/button';
import {Card} from '@ksf/sdk/card';
import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function BorderBeamBasicExample(){const [count,setCount]=useState(0);return <BorderBeam count={2} lineWidth={2}><Card title='重点资料' description='两条边缘光束'><p>装饰效果使用KSF主色，交互仍由内部控件承担。</p><Button onClick={()=>setCount(v=>v+1)}>查看 {count} 次</Button></Card></BorderBeam>;}
