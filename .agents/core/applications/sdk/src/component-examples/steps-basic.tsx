import {useState,useRef,useId} from 'react';
import {Steps} from '@ksf/sdk/steps';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function StepsBasicExample(){const [current,setCurrent]=useState(1);return <div className='ksf-demo-stack'><Steps items={[{id:'prepare',title:'准备',description:'资料与范围'},{id:'work',title:'实施',description:'实现与核验'},{id:'deliver',title:'交付',description:'用户查看效果'}]} current={current} onStepSelect={setCurrent}/><div className='ksf-demo-row'><Button disabled={current===0} onClick={()=>setCurrent(v=>v-1)}>上一步</Button><Button disabled={current===2} onClick={()=>setCurrent(v=>v+1)}>下一步</Button></div></div>;}
