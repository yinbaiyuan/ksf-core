import {useState} from 'react';
import {BorderBeam} from '@ksf/sdk/border-beam';
import {Button} from '@ksf/sdk/button';
import {Card} from '@ksf/sdk/card';
import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function BorderBeamStatesExample(){const [disabled,setDisabled]=useState(false);return <div className='ksf-demo-stack'><Button onClick={()=>setDisabled(v=>!v)}>切换光束</Button><BorderBeam hoverOnly duration={4} disabled={disabled}><Card title='悬停或聚焦时强调'><Button>键盘聚焦查看边缘</Button></Card></BorderBeam></div>;}
